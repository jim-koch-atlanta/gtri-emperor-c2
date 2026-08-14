using System.Collections.ObjectModel;
using System.Windows;
using Emperor;
using operator_gui.Feed;

namespace operator_gui.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly IFeed _feed;
    private readonly Dictionary<string, RobotViewModel> _byId = new();
    private readonly CancellationTokenSource _cts = new();

    public ObservableCollection<RobotViewModel> Robots { get; } = new();

    private string _StatusText = "starting…";
    public string StatusText { get => _StatusText; private set => SetField(ref _StatusText, value); }

    public MainViewModel(IFeed feed)
    {
        _feed = feed;
        StatusText = $"feed: {feed.GetType().Name}";
        // Ctor runs on the UI thread, so Application.Current.Dispatcher below is
        // the UI dispatcher. Start the reader on a background Task (idiom 1).
        _ = Task.Run(RunFeedAsync);
    }

    // ── DEFENSE-CRITICAL IDIOM 1: background-task stream reader ──────────────
    // Frames are pulled on a background Task, NEVER the UI thread. A gRPC server
    // stream blocks between frames waiting on the socket; doing that on the UI
    // thread would freeze the window solid. `await foreach` consumes the async
    // stream one frame at a time. ConfigureAwait(false) = "don't try to resume
    // on the UI thread after each await" — we're staying off it on purpose and
    // hop back explicitly, per frame, in idiom 2.
    private async Task RunFeedAsync()
    {
        try
        {
            await foreach (var frame in _feed.Subscribe(_cts.Token).ConfigureAwait(false))
                await ApplyOnUiAsync(frame).ConfigureAwait(false);

            SetStatusOnUi("feed ended");
        }
        catch (OperationCanceledException) { /* window closing — normal */ }
        catch (Exception ex)
        {
            // Server down, stream reset, malformed frame: surface it, never crash.
            SetStatusOnUi($"feed error: {ex.Message}");
        }
    }

    // ── DEFENSE-CRITICAL IDIOM 2: marshal back to the UI thread ──────────────
    // The frame arrived on a background thread, but every RobotViewModel setter
    // raises PropertyChanged → WPF touches UI objects, which have THREAD AFFINITY
    // (only the UI thread may touch them). So we hop to the UI thread before
    // mutating any VM.
    //
    // CHOICE — Dispatcher.InvokeAsync over a captured SynchronizationContext:
    // the feed layer (IFeed/GrpcFeed) is deliberately WPF-free, and the marshal
    // lives HERE in the ViewModel, which is WPF-aware by definition. So the
    // idiomatic, self-documenting Dispatcher adds no coupling the VM doesn't
    // already have, and reads clearly to the next person. InvokeAsync (not the
    // blocking Invoke) so a slow UI can't deadlock the reader; awaiting it gives
    // gentle backpressure at our 5–10 Hz frame rate.
    private Task ApplyOnUiAsync(SwarmState frame)
        => Application.Current.Dispatcher.InvokeAsync(() => ApplyFrame(frame)).Task;

    private void SetStatusOnUi(string text)
        => Application.Current.Dispatcher.InvokeAsync(() => { StatusText = text; });

    // Runs on the UI thread. Upsert one RobotViewModel per robot_id.
    private void ApplyFrame(SwarmState frame)
    {
        foreach (var rs in frame.Robots)
        {
            var tel = rs.Telemetry;
            if (tel is null) continue;

            if (!_byId.TryGetValue(tel.RobotId, out var vm))
            {
                vm = new RobotViewModel(tel.RobotId);
                _byId[tel.RobotId] = vm;
                Robots.Add(vm);
            }

            vm.X = tel.X;
            vm.Y = tel.Y;
            (vm.CanvasX, vm.CanvasY) = WorldToCanvas(vm.X, vm.Y);
            vm.Heading = tel.Heading;
            vm.Status = StatusLabel(rs.LinkStatus);
            vm.Age = rs.AgeMs;
        }

        StatusText = $"{Robots.Count} robots · {frame.Robots.Count} in frame";
    }

    // Unchanged seam from the spike — identity today. Scale/offset + Fit All is
    // Saturday's work; the feed hands us world X/Y and this decides pixels.
    private (double, double) WorldToCanvas(double x, double y) => (x, y);

    private static string StatusLabel(LinkStatus s) => s switch
    {
        LinkStatus.LinkLive => "LIVE",
        LinkStatus.LinkStale => "STALE",
        LinkStatus.LinkLost => "LOST",
        _ => "?",
    };
}
