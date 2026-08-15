using System.Runtime.CompilerServices;
using Emperor;

namespace operator_gui.Feed;

/// <summary>
/// Default feed. Stands in for the whole C++ backend so the GUI runs with no
/// server. Reproduces the Thursday spike's motion — six robots on circles — but
/// now emitted as <c>Emperor.SwarmState</c> frames through the IFeed seam, the
/// exact shape GrpcFeed yields, at ~10 Hz.
/// </summary>
public sealed class FakeFeed : IFeed
{
    public async IAsyncEnumerable<SwarmState> Subscribe(
        [EnumeratorCancellation] CancellationToken ct)
    {
        double t = 0.0;
        while (!ct.IsCancellationRequested)
        {
            t += 0.5;
            var frame = new SwarmState();
            for (int i = 0; i < 6; i++)
            {
                double x = (i + 1) * 100 + 10.0 * Math.Cos((1.0 / 10.0) * t);
                double y = (i + 1) * 100 + 10.0 * Math.Sin((1.0 / 10.0) * t);
                frame.Robots.Add(new RobotState
                {
                    Telemetry = new Telemetry { RobotId = $"R{i + 1}", X = x, Y = y, Heading = 0 },
                    LinkStatus = LinkStatus.LinkLive,
                    AgeMs = 0,
                });
            }

            yield return frame;

            try { await Task.Delay(100, ct); }
            catch (OperationCanceledException) { yield break; }
        }
    }

    public Task<Accepted> SendCommand(OperatorCommand cmd)
        => Task.FromResult(new Accepted { CommandId = cmd.CommandId, Accepted_ = true, Detail = "fake (no-op)" });
}
