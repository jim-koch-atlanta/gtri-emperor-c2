// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// Composition root. Picks the feed, builds the ViewModel + window, and starts
// the feed loop. This is where dependency wiring lives — the VM never news-up a
// feed itself, so swapping FakeFeed <-> GrpcFeed is a one-line decision here.
using System.Windows;
using EmperorGuiPrototype.Feed;
using EmperorGuiPrototype.ViewModels;

namespace EmperorGuiPrototype;

public partial class App : Application
{
    private CancellationTokenSource? _cts;

    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Headless verification path: run the tactical pipeline without a UI and
        // exit with 0/1. Used overnight because no desktop was available to
        // screenshot. See SelfTest.cs.
        if (e.Args.Any(a => a.Equals("--selftest", StringComparison.OrdinalIgnoreCase)))
        {
            string log = System.IO.Path.Combine(AppContext.BaseDirectory, "selftest.log");
            Task.Run(async () =>
            {
                int code = await SelfTest.RunAsync(log);
                Dispatcher.Invoke(() => Shutdown(code));
            });
            return;   // no window
        }

        bool useGrpc = e.Args.Any(a => a.Equals("--grpc", StringComparison.OrdinalIgnoreCase));
        IFeed feed = useGrpc ? new GrpcFeed() : new FakeFeed();

        // Dispatcher = this UI thread's message pump. The VM marshals frames to it.
        var vm = new MainViewModel(Dispatcher);
        var window = new MainWindow
        {
            DataContext = vm,
            Title = useGrpc
                ? "Emperor C2 — TACTICAL  ·  gRPC localhost:50051  (UNTESTED overnight)"
                : "Emperor C2 — TACTICAL  ·  FAKE FEED",
        };
        window.Show();

        _cts = new CancellationTokenSource();
        _ = RunFeedAsync(vm, feed, _cts.Token);   // fire-and-forget, guarded below
    }

    private static async Task RunFeedAsync(MainViewModel vm, IFeed feed, CancellationToken ct)
    {
        try
        {
            await vm.RunAsync(feed, ct);
        }
        catch (OperationCanceledException) { /* normal shutdown */ }
        catch (Exception ex)
        {
            // A real app would surface this in the status bar; a MessageBox is
            // enough for a throwaway (e.g. GrpcFeed with no server -> connect fail).
            MessageBox.Show($"Feed stopped:\n{ex.Message}", "Emperor C2 (prototype)",
                MessageBoxButton.OK, MessageBoxImage.Warning);
        }
    }

    protected override void OnExit(ExitEventArgs e)
    {
        _cts?.Cancel();
        base.OnExit(e);
    }
}
