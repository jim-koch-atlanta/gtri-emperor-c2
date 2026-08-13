// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// Headless pipeline check (`EmperorGuiPrototype.exe --selftest`). It exists
// because this overnight session had no interactive desktop, so a real
// screenshot came out black. Rather than assert "it renders" from a dead
// screen grab, this drives the SAME code the UI drives — FakeFeed ->
// RobotViewModel.UpdateFrom -> Project -> ViewTransform — for 5 s and checks
// the geometry and the STALE->LIVE watchdog cycle are actually produced.
//
// It doubles as a teaching point: because the projection math lives in plain
// ViewModel/transform classes (not code-behind), the whole tactical pipeline is
// testable WITHOUT spinning up WPF. The real spike should promote this into a
// proper test project rather than a --selftest switch.
using System.IO;
using System.Text;
using System.Windows.Media;
using EmperorGuiPrototype.Feed;
using EmperorGuiPrototype.Rendering;
using EmperorGuiPrototype.ViewModels;

namespace EmperorGuiPrototype;

public static class SelfTest
{
    public static async Task<int> RunAsync(string logPath)
    {
        var sb = new StringBuilder();
        void Log(string s) => sb.AppendLine(s);

        Log("EmperorGuiPrototype --selftest : headless tactical-pipeline check");
        Log("=================================================================");

        var feed = new FakeFeed();
        var byId = new Dictionary<string, RobotViewModel>();
        ViewTransform vt = ViewTransform.Default;

        int frames = 0;
        double sMinX = 1e9, sMinY = 1e9, sMaxX = -1e9, sMaxY = -1e9;
        bool anyNonFinite = false;
        var wentStale = new HashSet<string>();
        var recoveredLive = new HashSet<string>();
        int maxTrail = 0;

        using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(5));
        try
        {
            await foreach (var frame in feed.Subscribe(cts.Token))
            {
                frames++;

                // First frame: compute Fit from the real robot spread, exactly
                // as the [Fit All] button / auto-fit does. Viewport 1000x700.
                if (frames == 1)
                {
                    double mnx = 1e9, mny = 1e9, mxx = -1e9, mxy = -1e9;
                    foreach (var rs in frame.Robots)
                    {
                        mnx = Math.Min(mnx, rs.Telemetry.X); mxx = Math.Max(mxx, rs.Telemetry.X);
                        mny = Math.Min(mny, rs.Telemetry.Y); mxy = Math.Max(mxy, rs.Telemetry.Y);
                    }
                    vt = ViewTransform.Fit(mnx, mny, mxx, mxy, 1000, 700);
                }

                foreach (var rs in frame.Robots)
                {
                    string id = rs.Telemetry.RobotId;
                    if (!byId.TryGetValue(id, out var vm))
                    {
                        vm = new RobotViewModel(id, Colors.White);
                        byId[id] = vm;
                    }
                    vm.UpdateFrom(rs);
                    vm.Project(vt);

                    if (!double.IsFinite(vm.ScreenX) || !double.IsFinite(vm.ScreenY)) anyNonFinite = true;
                    sMinX = Math.Min(sMinX, vm.ScreenX); sMaxX = Math.Max(sMaxX, vm.ScreenX);
                    sMinY = Math.Min(sMinY, vm.ScreenY); sMaxY = Math.Max(sMaxY, vm.ScreenY);
                    maxTrail = Math.Max(maxTrail, vm.TrailPoints.Count);

                    if (rs.LinkStatus == Emperor.LinkStatus.LinkStale) wentStale.Add(id);
                    if (rs.LinkStatus == Emperor.LinkStatus.LinkLive && wentStale.Contains(id))
                        recoveredLive.Add(id);
                }
            }
        }
        catch (OperationCanceledException) { /* 5 s window elapsed — expected */ }

        // ---- assertions --------------------------------------------------
        // NOTE on bounds: [Fit All] fits the INSTANTANEOUS snapshot, and robots
        // then orbit partly outside it (telemetry carries position, not orbit
        // center, so the swept circle can't be fitted from one frame). So the
        // invariant is "finite, viewport-scale, non-degenerate" — NOT strict
        // containment. (Whether Fit All should fit accumulated extent is an open
        // question for the real spike; see MORNING_REPORT.md.)
        int robots = byId.Count;
        double spreadX = sMaxX - sMinX, spreadY = sMaxY - sMinY;
        bool boundsOk = !anyNonFinite
                        && spreadX > 50 && spreadX < 5000
                        && spreadY > 50 && spreadY < 5000;
        bool trailsGrew = maxTrail > 5;
        bool staleSeen = wentStale.Count > 0;
        bool recovered = recoveredLive.Count > 0;

        Log($"frames consumed .......... {frames}   (expect ~25 at 5 Hz over 5 s)");
        Log($"robots tracked ........... {robots}   (expect 6)");
        Log($"screen bounds ............ x[{sMinX:0},{sMaxX:0}] y[{sMinY:0},{sMaxY:0}]  spread {spreadX:0}x{spreadY:0}px");
        Log($"  -> finite, viewport-scale {(boundsOk ? "PASS" : "FAIL")}");
        Log($"max trail length ......... {maxTrail}   -> grew: {(trailsGrew ? "PASS" : "FAIL")}");
        Log($"watchdog STALE observed .. {(staleSeen ? "PASS" : "FAIL")}   robots: {string.Join(",", wentStale.OrderBy(x => x))}");
        Log($"watchdog STALE->LIVE ..... {(recovered ? "PASS" : "FAIL")}   robots: {string.Join(",", recoveredLive.OrderBy(x => x))}");

        bool pass = robots == 6 && boundsOk && trailsGrew && staleSeen && recovered && frames > 15;
        Log("=================================================================");
        Log(pass ? "RESULT: PASS -- tactical pipeline produces correct geometry + watchdog cycle."
                 : "RESULT: FAIL -- see failing lines above.");

        File.WriteAllText(logPath, sb.ToString());
        return pass ? 0 : 1;
    }
}
