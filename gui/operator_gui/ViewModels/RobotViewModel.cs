namespace operator_gui.ViewModels;

public sealed class RobotViewModel : ObservableObject
{
    private String _Id;
    public String Id { get => _Id; set => SetField(ref _Id, value); }

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

    private String _Status;
    public String Status { get => _Status; set => SetField(ref _Status, value); }

    public RobotViewModel(String id)
    {
        Id = id;
        Status = "PENDING";
    }
}