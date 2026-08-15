using System.Windows;
using System.Windows.Media;

namespace operator_gui.ViewModels;

public sealed class RobotViewModel : ObservableObject
{
    public RobotViewModel(string id) => Id = id;

    // Set once at construction → get-only auto-property (never notifies, and
    // satisfies the nullable analyzer, unlike a SetField field the ctor fills).
    public string Id { get; }

    private double _X;
    public double X { get => _X; set => SetField(ref _X, value); }

    private double _Y;
    public double Y { get => _Y; set => SetField(ref _Y, value); }

    private double _CanvasX;
    public double CanvasX { get => _CanvasX; set => SetField(ref _CanvasX, value); }

    private double _CanvasY;
    public double CanvasY { get => _CanvasY; set => SetField(ref _CanvasY, value); }

    private double _Heading;
    public double Heading { get => _Heading; set => SetField(ref _Heading, value); }

    private double _Speed;
    public double Speed { get => _Speed; set => SetField(ref _Speed, value); }

    private double _Radius;
    public double Radius { get => _Radius; set => SetField(ref _Radius, value); }

    private string _Status = "PENDING";
    public string Status { get => _Status; set => SetField(ref _Status, value); }

    // Telemetry age from the server's RobotState (ms). Plumbed now; the roster
    // that displays it is Saturday's work.
    private long _Age;
    public long Age { get => _Age; set => SetField(ref _Age, value); }

    // Is this specific robot selected on the UI?
    private bool _IsSelected;
    public bool IsSelected { get => _IsSelected; set => SetField(ref _IsSelected, value); }

    public List<Point> WorldTrail { get; } = new();   // world X/Y, last ~50

    private PointCollection _Trail = new();
    public PointCollection Trail { get => _Trail; set => SetField(ref _Trail, value); }

}
