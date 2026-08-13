// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// World->screen projection for the tactical view.
//
// DESIGN CHOICE (defend this in the real spike): we project in the ViewModel,
// producing SCREEN-space geometry, rather than putting a RenderTransform on the
// Canvas. Why: a tactical display wants symbols (dots, labels, heading ticks)
// to stay a CONSTANT pixel size while POSITIONS scale with zoom. A single
// RenderTransform on the Canvas scales everything — the dots balloon and text
// blurs as you zoom in. Projecting positions here, drawing fixed-size glyphs in
// screen space, gives the correct behavior and keeps the transform math as
// plain, unit-testable code (which fits this project's testing culture).
//
// The RenderTransform approach is taught in the report as the alternative and
// when it's the right tool (a single scalable content layer, e.g. a map tile
// image under the symbols).
//
// World Y is "up" (the §2 motion equations are standard math orientation);
// screen Y grows DOWN, so the projection flips Y.
using System.Windows;

namespace EmperorGuiPrototype.Rendering;

public sealed class ViewTransform
{
    public double Scale { get; }
    public double CenterX { get; }   // world coords mapped to viewport middle
    public double CenterY { get; }
    public double ViewportW { get; }
    public double ViewportH { get; }

    public ViewTransform(double scale, double centerX, double centerY, double vw, double vh)
    {
        Scale = scale;
        CenterX = centerX;
        CenterY = centerY;
        ViewportW = vw;
        ViewportH = vh;
    }

    // Identity-ish default before the first layout pass gives us a viewport.
    public static ViewTransform Default { get; } = new(1.0, 0, 0, 0, 0);

    public Point WorldToScreen(double wx, double wy)
        => new((wx - CenterX) * Scale + ViewportW / 2.0,
               (CenterY - wy) * Scale + ViewportH / 2.0);   // note the Y flip

    // Fit All: choose scale + center so a world bounding box fills the viewport
    // with a margin. This is exactly what the [Fit All] button computes.
    public static ViewTransform Fit(
        double minX, double minY, double maxX, double maxY,
        double vw, double vh, double margin = 0.88)
    {
        if (vw <= 0 || vh <= 0) return Default;

        double worldW = Math.Max(maxX - minX, 1e-6);
        double worldH = Math.Max(maxY - minY, 1e-6);
        double scale = margin * Math.Min(vw / worldW, vh / worldH);

        return new ViewTransform(scale, (minX + maxX) / 2.0, (minY + maxY) / 2.0, vw, vh);
    }

    // Re-center/zoom helpers for pan & wheel-zoom, keeping viewport size fixed.
    public ViewTransform WithViewport(double vw, double vh)
        => new(Scale, CenterX, CenterY, vw, vh);

    public ViewTransform WithScale(double scale)
        => new(scale, CenterX, CenterY, ViewportW, ViewportH);

    public ViewTransform WithCenter(double cx, double cy)
        => new(Scale, cx, cy, ViewportW, ViewportH);
}
