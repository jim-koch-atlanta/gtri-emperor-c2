// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// Code-behind for the tactical view. MVVM keeps LOGIC in the ViewModel; what
// legitimately lives here is raw INPUT PLUMBING that has no clean binding:
//   - the Canvas reporting its pixel size (needed to compute Fit All),
//   - hit-testing a dot to drive selection,
//   - mouse wheel / drag deltas for zoom / pan.
// Each handler just translates a gesture into a VM method call — no domain
// logic. A stricter MVVM shop would move these into attached behaviors; for a
// throwaway, named handlers are the clearest teaching form. (Called out in the
// report as the one deliberate code-behind seam.)
using System.Windows;
using System.Windows.Input;
using EmperorGuiPrototype.ViewModels;

namespace EmperorGuiPrototype;

public partial class MainWindow : Window
{
    private bool _panning;
    private Point _lastMouse;

    public MainWindow() => InitializeComponent();

    private MainViewModel? Vm => DataContext as MainViewModel;

    // The Canvas/ItemsControl now knows its size -> hand it to the VM so Fit All
    // and projection have a viewport. Fires on load and on every resize.
    private void Tactical_SizeChanged(object sender, SizeChangedEventArgs e)
        => Vm?.SetViewport(e.NewSize.Width, e.NewSize.Height);

    // A dot was clicked: its DataContext IS the RobotViewModel. Set selection and
    // mark handled so the click doesn't also start a pan.
    private void Dot_Click(object sender, MouseButtonEventArgs e)
    {
        if (sender is FrameworkElement fe && fe.DataContext is RobotViewModel r && Vm is not null)
        {
            Vm.SelectedRobot = r;
            e.Handled = true;
        }
    }

    private void Tactical_MouseWheel(object sender, MouseWheelEventArgs e)
        => Vm?.Zoom(e.Delta > 0 ? 1.1 : 1.0 / 1.1);

    private void Tactical_MouseDown(object sender, MouseButtonEventArgs e)
    {
        _panning = true;
        _lastMouse = e.GetPosition(Tactical);
        Tactical.CaptureMouse();
    }

    private void Tactical_MouseMove(object sender, MouseEventArgs e)
    {
        if (!_panning) return;
        var p = e.GetPosition(Tactical);
        Vm?.PanByPixels(p.X - _lastMouse.X, p.Y - _lastMouse.Y);
        _lastMouse = p;
    }

    private void Tactical_MouseUp(object sender, MouseButtonEventArgs e)
    {
        _panning = false;
        Tactical.ReleaseMouseCapture();
    }
}
