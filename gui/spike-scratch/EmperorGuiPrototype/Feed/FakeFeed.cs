// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// FakeFeed — the DEFAULT feed. It stands in for the whole C++ backend (6 robots
// + C2 server) so the WPF app runs standalone with zero external dependencies.
// It builds real `Emperor.SwarmState` protobufs, so the rendering pipeline it
// drives is byte-for-byte the one GrpcFeed will drive against the real server.
//
// It models three things the real backend owns:
//   1. §2 circular motion:  x = x0 + R*cos(V/R*t + th0),  y = y0 + R*sin(...)
//   2. per-robot seq numbers incrementing (the track-store ordering key)
//   3. the link watchdog: one robot is frozen ~3.5s every 20s -> age climbs
//      -> LINK_STALE -> then resumes -> LINK_LIVE (the §5 / §8 demo, faked)
using System.Runtime.CompilerServices;
using System.Windows.Media;
using Google.Protobuf.WellKnownTypes;

namespace EmperorGuiPrototype.Feed;

public sealed class FakeFeed : IFeed
{
    // Watchdog thresholds (demo values). A frozen robot crosses StaleMs and shows
    // STALE, but the 3.5s freeze never reaches LostMs, so it recovers to LIVE —
    // matching the brief ("going STALE ... then LIVE").
    private const double StaleMs = 1000;
    private const double LostMs = 5000;
    private const double TickHz = 5.0;
    private const double FreezeSecs = 3.5;
    private const double FreezeEverySecs = 20.0;

    private sealed record Params(string Id, double X0, double Y0, double R, double V, double Th0, Color Color);

    // Six robots, distinct parameters (TECH_SPEC §2 / demo roster R-01..R-06).
    private static readonly Params[] Fleet =
    {
        new("R-01",   0,   0, 120, 18, 0.0, Color.FromRgb(0x4F, 0xC3, 0xF7)),
        new("R-02",  60, -40,  80, 25, 1.0, Color.FromRgb(0x81, 0xC7, 0x84)),
        new("R-03", -80,  40, 100, 12, 2.0, Color.FromRgb(0xFF, 0xB7, 0x4D)),
        new("R-04",  40,  80, 150, 30, 0.5, Color.FromRgb(0xE5, 0x73, 0x73)),
        new("R-05", -60, -70,  60, 15, 3.0, Color.FromRgb(0xBA, 0x68, 0xC8)),
        new("R-06",  90,  30, 110, 22, 4.5, Color.FromRgb(0xFF, 0xD5, 0x4F)),
    };

    // Palette exposed so the ViewModel can color-match roster + dot.
    public static IReadOnlyDictionary<string, Color> Palette
        => Fleet.ToDictionary(p => p.Id, p => p.Color);

    // §2 circular motion: position + tangent heading at sim time t.
    private static Emperor.Telemetry Fix(Params p, double t, ulong seq, DateTime now)
    {
        double ang = p.V / p.R * t + p.Th0;
        return new Emperor.Telemetry
        {
            RobotId = p.Id,
            Seq = seq,
            Timestamp = Timestamp.FromDateTime(now),
            X = p.X0 + p.R * Math.Cos(ang),
            Y = p.Y0 + p.R * Math.Sin(ang),
            // heading = velocity direction = d/dt(x,y) ∝ (-sin, cos)
            Heading = Math.Atan2(Math.Cos(ang), -Math.Sin(ang)),
            Speed = p.V,
            Radius = p.R,
        };
    }

    public async IAsyncEnumerable<Emperor.SwarmState> Subscribe(
        [EnumeratorCancellation] CancellationToken ct)
    {
        var start = DateTime.UtcNow;
        // Per-robot wall-clock of last fresh fix — age_ms is measured from this,
        // exactly as the real server measures from its own receive time (§4).
        var lastFix = new DateTime[Fleet.Length];
        var seq = new ulong[Fleet.Length];
        var last = new Emperor.Telemetry[Fleet.Length];

        // Seed every robot with a valid t=0 fix, so a robot that is frozen from
        // the very first frame still has a "last known" telemetry (never a null
        // on the wire) — it just holds this fix while its age climbs.
        for (int i = 0; i < Fleet.Length; i++)
        {
            lastFix[i] = start;
            last[i] = Fix(Fleet[i], 0.0, ++seq[i], start);
        }

        ulong broadcastSeq = 0;
        var period = TimeSpan.FromSeconds(1.0 / TickHz);

        while (!ct.IsCancellationRequested)
        {
            var now = DateTime.UtcNow;
            double t = (now - start).TotalSeconds;

            // Which robot (if any) is frozen right now: cycle one per 20s window,
            // frozen for the first 3.5s of that window.
            double phase = t % FreezeEverySecs;
            int frozenIdx = phase < FreezeSecs ? (int)(t / FreezeEverySecs) % Fleet.Length : -1;

            var swarm = new Emperor.SwarmState
            {
                Seq = broadcastSeq++,
                ServerTime = Timestamp.FromDateTime(now),
            };

            for (int i = 0; i < Fleet.Length; i++)
            {
                var p = Fleet[i];
                if (i != frozenIdx)
                {
                    last[i] = Fix(p, t, ++seq[i], now);
                    lastFix[i] = now;
                }
                // else: frozen — reuse last[i], don't bump seq, let age climb.

                double ageMs = (now - lastFix[i]).TotalMilliseconds;
                var link = ageMs < StaleMs ? Emperor.LinkStatus.LinkLive
                         : ageMs < LostMs ? Emperor.LinkStatus.LinkStale
                         : Emperor.LinkStatus.LinkLost;

                swarm.Robots.Add(new Emperor.RobotState
                {
                    Telemetry = last[i],
                    LinkStatus = link,
                    AgeMs = (long)ageMs,
                });
            }

            yield return swarm;

            try { await Task.Delay(period, ct); }
            catch (OperationCanceledException) { yield break; }
        }
    }
}
