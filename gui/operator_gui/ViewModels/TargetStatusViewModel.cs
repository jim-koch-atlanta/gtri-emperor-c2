using operator_gui;

public sealed class TargetStatusViewModel : ObservableObject
{
    public TargetStatusViewModel(string robotId) => RobotId = robotId;
    public string RobotId { get; }
    private string _State = "";
    public string State { get => _State; set => SetField(ref _State, value); }
}
