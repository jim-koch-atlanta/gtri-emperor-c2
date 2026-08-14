using System.Windows;
using operator_gui.Feed;
using operator_gui.ViewModels;

namespace operator_gui;

/// <summary>
/// Composition root. Chooses the feed and injects it into the ViewModel — the
/// IFeed seam is a one-line swap here; the whole UI is identical either way.
/// </summary>
public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        // Feed selection: --grpc arg OR EMPEROR_FEED=grpc env var; default Fake
        // so the app always runs standalone with no server.
        bool useGrpc =
            e.Args.Any(a => a.Equals("--grpc", StringComparison.OrdinalIgnoreCase))
            || string.Equals(Environment.GetEnvironmentVariable("EMPEROR_FEED"), "grpc",
                             StringComparison.OrdinalIgnoreCase);

        IFeed feed = useGrpc ? new GrpcFeed() : new FakeFeed();

        var window = new MainWindow { DataContext = new MainViewModel(feed) };
        window.Show();
    }
}
