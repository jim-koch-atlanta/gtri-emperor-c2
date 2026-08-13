// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// One RobotViewModel per robot. It holds WORLD-space truth (from telemetry) and
// exposes SCREEN-space geometry (recomputed by Project()) that the DataTemplate
// binds to. Splitting "world state" from "screen projection" is the seam that
// lets Fit All / zoom / pan re-project without re-touching telemetry.
using System.Windows;
using System.Windows.Media;
using EmperorGuiPrototype.Mvvm;
using EmperorGuiPrototype.Rendering;

namespace EmperorGuiPrototype.ViewModels;

public sealed class RobotViewModel : ObservableObject
{
    private const int TrailMax = 50;          // last ~50 points, per the brief
    private const double DotRadius = 6.0;
    private const double HeadingLen = 16.0;   // screen px, constant regardless of zoom
    private const double SelRingRadius = 12.0;

    private readonly Queue<Point> _worldTrail = new();
    private readonly Brush _liveBrush;

    public RobotViewModel(string robotId, Color color)
    {
        RobotId = robotId;
        _liveBrush = new SolidColorBrush(color);
        _liveBrush.Freeze();   // frozen brushes are cross-thread + cheaper to render
        TrailPoints = new PointCollection();
    }

    public string RobotId { get; }

    // ---- world-space truth (set from each SwarmState frame) ------------------
    public double WorldX { get; private set; }
    public double WorldY { get; private set; }
    public double Heading { get; private set; }
    public double Speed { get; private set; }
    public double Radius { get; private set; }
    public ulong Seq { get; private set; }
    public Emperor.LinkStatus Link { get; private set; }
    public long AgeMs { get; private set; }

    // ---- selection ----------------------------------------------------------
    private bool _isSelected;
    public bool IsSelected
    {
        get => _isSelected;
        set { if (Set(ref _isSelected, value)) { Raise(nameof(SelRingVisible)); Raise(nameof(GlyphStroke)); } }
    }

    // ---- screen-space geometry (recomputed by Project) ----------------------
    public double ScreenX { get; private set; }
    public double ScreenY { get; private set; }
    public double DotLeft => ScreenX - DotRadius;   // Ellipse Canvas.Left/Top
    public double DotTop => ScreenY - DotRadius;
    public double DotSize => DotRadius * 2;
    public double HeadingX2 { get; private set; }   // heading tick endpoint
    public double HeadingY2 { get; private set; }
    public double LabelX => ScreenX + DotRadius + 3;
    public double LabelY => ScreenY - DotRadius - 2;
    public double SelLeft => ScreenX - SelRingRadius;
    public double SelTop => ScreenY - SelRingRadius;
    public double SelSize => SelRingRadius * 2;
    public PointCollection TrailPoints { get; private set; }

    // ---- display sugar ------------------------------------------------------
    public bool IsStale => Link == Emperor.LinkStatus.LinkStale;
    public bool IsLost => Link == Emperor.LinkStatus.LinkLost;
    public bool SelRingVisible => IsSelected;

    public string StatusText => Link switch
    {
        Emperor.LinkStatus.LinkLive => "LIVE",
        Emperor.LinkStatus.LinkStale => "STALE",
        Emperor.LinkStatus.LinkLost => "LOST",
        _ => "—",
    };

    public string AgeText => AgeMs < 1000 ? $"{AgeMs} ms" : $"{AgeMs / 1000.0:0.0} s";
    public string SpeedText => $"{Speed:0.#} m/s";
    public string RadiusText => $"{Radius:0.#} m";
    public string RosterLine => $"{RobotId}   {StatusText}   {AgeText}";

    // Gray when the link isn't LIVE; the operator must see degradation, not just
    // a frozen dot (TECH_SPEC §3: "never have to notice a missing dot").
    public Brush GlyphFill => Link == Emperor.LinkStatus.LinkLive ? _liveBrush
                            : Link == Emperor.LinkStatus.LinkStale ? Brushes.Gray
                            : Brushes.DimGray;

    public Brush GlyphStroke => IsSelected ? Brushes.White : Brushes.Transparent;

    // Dashed outline for a degraded link; solid (null) when LIVE.
    public DoubleCollection? DashArray => Link == Emperor.LinkStatus.LinkLive
        ? null : new DoubleCollection(new double[] { 2, 2 });

    // -------------------------------------------------------------------------
    public void UpdateFrom(Emperor.RobotState rs)
    {
        var t = rs.Telemetry;
        Link = rs.LinkStatus;
        AgeMs = rs.AgeMs;

        // Only advance world position + trail while we're getting fresh fixes.
        // A STALE robot's dot and trail freeze in place — honest "last known".
        bool fresh = t != null && t.Seq != Seq;
        if (t != null && fresh)
        {
            WorldX = t.X;
            WorldY = t.Y;
            Heading = t.Heading;
            Speed = t.Speed;
            Radius = t.Radius;
            Seq = t.Seq;

            _worldTrail.Enqueue(new Point(WorldX, WorldY));
            while (_worldTrail.Count > TrailMax) _worldTrail.Dequeue();
        }
    }

    // Recompute all screen geometry from world state under the given transform.
    public void Project(ViewTransform vt)
    {
        var p = vt.WorldToScreen(WorldX, WorldY);
        ScreenX = p.X;
        ScreenY = p.Y;

        // Heading tick: project a point a little ahead along the heading, take
        // the screen-space direction, and step a CONSTANT pixel length. This
        // sidesteps hand-reasoning about the Y-flip — the projection handles it.
        var ahead = vt.WorldToScreen(WorldX + Math.Cos(Heading), WorldY + Math.Sin(Heading));
        double dx = ahead.X - p.X, dy = ahead.Y - p.Y;
        double len = Math.Sqrt(dx * dx + dy * dy);
        if (len > 1e-6) { dx /= len; dy /= len; } else { dx = 1; dy = 0; }
        HeadingX2 = ScreenX + dx * HeadingLen;
        HeadingY2 = ScreenY + dy * HeadingLen;

        // Rebuild the trail polyline in screen space. New PointCollection each
        // frame so the Polyline.Points binding actually re-reads (mutating in
        // place would not raise change notification).
        var pts = new PointCollection(_worldTrail.Count);
        foreach (var w in _worldTrail) pts.Add(vt.WorldToScreen(w.X, w.Y));
        TrailPoints = pts;

        RaiseAll();   // one bulk refresh; fine at this robot count (see report)
    }
}
