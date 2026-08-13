// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// SKETCH ONLY — compiled to prove the shape, but NOT wired into the app
// (nothing constructs it). It shows the ALTERNATIVE rendering path for when the
// retained-mode ItemsControl+DataTemplate approach stops scaling.
//
// WHEN DOES THE BINDING APPROACH STOP SCALING?
//   The tactical view we built creates a live visual subtree PER ROBOT (an
//   inner Canvas + Polyline + 2 Ellipses + Line + TextBlock) and re-evaluates
//   its bindings whenever the VM raises PropertyChanged. That is wonderfully
//   productive at 6–~200 tracks: layout, hit-testing, and selection "just work."
//   But every element is a full WPF Visual with layout/measure/arrange cost and
//   memory overhead. Around the low thousands of moving tracks (esp. with
//   trails = thousands of Polyline points redrawn at 5 Hz), the visual-tree and
//   per-frame binding churn dominate and frame rate falls off.
//
//   At that point you drop to IMMEDIATE MODE: one FrameworkElement, one
//   OnRender that draws all symbols directly to a DrawingContext (or a pool of
//   DrawingVisuals). You trade WPF's free layout/hit-testing (now you hit-test
//   yourself) for flat, allocation-light drawing. TECH_SPEC §9 "Level of
//   detail" is the same idea: "the GPU-backed view renders tracks, the UI
//   framework renders workflow." Symbols -> immediate mode; roster, panels,
//   command strip -> stay in bindings.
//
// This sketch is the seam: same projected screen coords the ViewModel already
// produces, drawn in one pass instead of one-visual-per-robot.
using System.Windows;
using System.Windows.Media;

namespace EmperorGuiPrototype.Rendering;

/// <summary>Immediate-mode tactical layer (sketch — not wired in).</summary>
public sealed class ImmediateModeSketch : FrameworkElement
{
    public readonly record struct Symbol(Point Screen, Point HeadingEnd, Brush Fill,
                                         PointCollection Trail, bool Selected);

    private IReadOnlyList<Symbol> _symbols = Array.Empty<Symbol>();

    // The consumer would call this each frame with the SAME projected geometry
    // RobotViewModel.Project() computes, then WPF calls OnRender once.
    public void SetFrame(IReadOnlyList<Symbol> symbols)
    {
        _symbols = symbols;
        InvalidateVisual();   // schedules exactly one OnRender pass
    }

    protected override void OnRender(DrawingContext dc)
    {
        var trailPen = new Pen(Brushes.Gray, 1.5) { };
        foreach (var s in _symbols)
        {
            // trail
            if (s.Trail.Count > 1)
            {
                var geo = new StreamGeometry();
                using (var g = geo.Open())
                {
                    g.BeginFigure(s.Trail[0], isFilled: false, isClosed: false);
                    g.PolyLineTo(s.Trail.Skip(1).ToArray(), isStroked: true, isSmoothJoin: false);
                }
                geo.Freeze();
                dc.DrawGeometry(null, new Pen(s.Fill, 1.5) { }, geo);
            }
            // heading tick
            dc.DrawLine(new Pen(s.Fill, 2), s.Screen, s.HeadingEnd);
            // selection ring
            if (s.Selected)
                dc.DrawEllipse(null, new Pen(Brushes.White, 1.5), s.Screen, 12, 12);
            // dot
            dc.DrawEllipse(s.Fill, null, s.Screen, 6, 6);
        }
        _ = trailPen;   // (kept only to name the retained-vs-immediate contrast)
    }
}
