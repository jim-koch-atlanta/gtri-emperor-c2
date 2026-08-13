// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// MainViewModel — the tactical view's brain. It owns the robot collection, the
// selection model, the swarm health counts, and the view transform; it runs the
// feed-consume loop and marshals every frame to the UI thread.
//
// ================== THE THREADING IDIOM (read this) ==================
// A gRPC server stream (and our FakeFeed) delivers frames on a BACKGROUND
// thread. WPF objects have THREAD AFFINITY: an ObservableCollection bound to the
// UI, and every DispatcherObject, may only be touched on the UI (dispatcher)
// thread. Touch them from the reader thread and WPF throws:
//     "The calling thread cannot access this object because a different
//      thread owns it."
// (An ObservableCollection specifically throws NotSupportedException on
//  cross-thread CollectionChanged.)
//
// So the pattern is: READ on the background task, APPLY on the UI thread. We
// await the feed with ConfigureAwait(false) to make explicit we're off the UI
// thread, then hop back with Dispatcher.Invoke for the mutation. Delete that
// Invoke and the app throws on the first frame — that's the lesson.
// =====================================================================
using System.Collections.ObjectModel;
using System.Windows.Media;
using System.Windows.Threading;
using EmperorGuiPrototype.Feed;
using EmperorGuiPrototype.Mvvm;
using EmperorGuiPrototype.Rendering;

namespace EmperorGuiPrototype.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    private readonly Dispatcher _ui;
    private readonly Dictionary<string, RobotViewModel> _byId = new();
    private ViewTransform _vt = ViewTransform.Default;
    private double _vw, _vh;
    private bool _autoFitted;

    public MainViewModel(Dispatcher ui)
    {
        _ui = ui;
        FitAllCommand = new RelayCommand(FitAll);
    }

    public ObservableCollection<RobotViewModel> Robots { get; } = new();
    public RelayCommand FitAllCommand { get; }

    // ---- selection: two-way with the roster ListBox, and settable from a map
    //      click (code-behind). Setting it re-flags every robot's IsSelected so
    //      the canvas draws the ring on exactly one dot. ----------------------
    private RobotViewModel? _selected;
    public RobotViewModel? SelectedRobot
    {
        get => _selected;
        set
        {
            if (!Set(ref _selected, value)) return;
            foreach (var r in Robots) r.IsSelected = ReferenceEquals(r, value);
            Raise(nameof(HasSelection));
        }
    }
    public bool HasSelection => _selected != null;

    // ---- swarm health counts (the status bar) -------------------------------
    private int _live, _stale, _lost;
    public int LiveCount { get => _live; private set { if (Set(ref _live, value)) Raise(nameof(StatusSummary)); } }
    public int StaleCount { get => _stale; private set { if (Set(ref _stale, value)) Raise(nameof(StatusSummary)); } }
    public int LostCount { get => _lost; private set { if (Set(ref _lost, value)) Raise(nameof(StatusSummary)); } }
    public string StatusSummary => $"{LiveCount} LIVE · {StaleCount} STALE · {LostCount} LOST";

    // ---- viewport plumbing: the Canvas reports its size (code-behind) -------
    public void SetViewport(double w, double h)
    {
        _vw = w; _vh = h;
        _vt = _vt.WithViewport(w, h);
        if (!_autoFitted) TryAutoFit();
        else Reproject();
    }

    public void FitAll()
    {
        if (Robots.Count == 0 || _vw <= 0) return;
        double minX = double.MaxValue, minY = double.MaxValue, maxX = double.MinValue, maxY = double.MinValue;
        foreach (var r in Robots)
        {
            minX = Math.Min(minX, r.WorldX); maxX = Math.Max(maxX, r.WorldX);
            minY = Math.Min(minY, r.WorldY); maxY = Math.Max(maxY, r.WorldY);
        }
        _vt = ViewTransform.Fit(minX, minY, maxX, maxY, _vw, _vh);
        Reproject();
    }

    // ---- mouse-wheel zoom + drag pan (code-behind forwards raw input) --------
    public void Zoom(double factor)
    {
        if (_vt.Scale <= 0) return;
        _vt = _vt.WithScale(Math.Clamp(_vt.Scale * factor, 0.05, 200));
        Reproject();
    }

    public void PanByPixels(double dxPx, double dyPx)
    {
        if (_vt.Scale <= 0) return;
        // pixels -> world (screen Y is flipped, so dy negates)
        _vt = _vt.WithCenter(_vt.CenterX - dxPx / _vt.Scale, _vt.CenterY + dyPx / _vt.Scale);
        Reproject();
    }

    private void TryAutoFit()
    {
        if (!_autoFitted && Robots.Count > 0 && _vw > 0) { FitAll(); _autoFitted = true; }
    }

    private void Reproject()
    {
        foreach (var r in Robots) r.Project(_vt);
    }

    // ---- the feed loop ------------------------------------------------------
    public async Task RunAsync(IFeed feed, CancellationToken ct)
    {
        // ConfigureAwait(false): we do NOT want to resume on the UI thread here —
        // the whole point is to keep the read off the UI thread. We hop back
        // deliberately, per frame, via _ui.Invoke below.
        await foreach (var frame in feed.Subscribe(ct).ConfigureAwait(false))
        {
            _ui.Invoke(() => ApplyFrame(frame));   // <-- marshal to UI thread
        }
    }

    // Runs on the UI thread (invoked above). Safe to touch ObservableCollection.
    private void ApplyFrame(Emperor.SwarmState frame)
    {
        foreach (var rs in frame.Robots)
        {
            string id = rs.Telemetry?.RobotId ?? "";
            if (id.Length == 0) continue;

            if (!_byId.TryGetValue(id, out var vm))
            {
                var color = FakeFeed.Palette.TryGetValue(id, out var c) ? c : Colors.White;
                vm = new RobotViewModel(id, color);
                _byId[id] = vm;
                Robots.Add(vm);
                TryAutoFit();
            }
            vm.UpdateFrom(rs);
        }

        RecountHealth();
        Reproject();
    }

    private void RecountHealth()
    {
        int live = 0, stale = 0, lost = 0;
        foreach (var r in Robots)
        {
            switch (r.Link)
            {
                case Emperor.LinkStatus.LinkLive: live++; break;
                case Emperor.LinkStatus.LinkStale: stale++; break;
                case Emperor.LinkStatus.LinkLost: lost++; break;
            }
        }
        LiveCount = live; StaleCount = stale; LostCount = lost;
    }
}
