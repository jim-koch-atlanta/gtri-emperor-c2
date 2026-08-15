using System.Collections.ObjectModel;
using operator_gui;

public sealed class CommandStatusViewModel : ObservableObject
{
    public CommandStatusViewModel(string commandId) => CommandId = commandId;
    public string CommandId { get; }
    public string ShortId => CommandId.Length >= 8 ? CommandId[..8] : CommandId;
    public ObservableCollection<TargetStatusViewModel> Targets { get; } = new();
}
