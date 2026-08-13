// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// ICommand lets a Button in XAML invoke a ViewModel method with no code-behind
// (Button Command="{Binding FitAllCommand}"). This is the MVVM way to wire a
// button: the VM owns the verb, the view just points at it. A real project
// would use CommunityToolkit.Mvvm's [RelayCommand] source generator instead of
// hand-rolling this — noted in the report.
using System.Windows.Input;

namespace EmperorGuiPrototype.Mvvm;

public sealed class RelayCommand : ICommand
{
    private readonly Action _execute;
    private readonly Func<bool>? _canExecute;

    public RelayCommand(Action execute, Func<bool>? canExecute = null)
    {
        _execute = execute;
        _canExecute = canExecute;
    }

    public bool CanExecute(object? parameter) => _canExecute?.Invoke() ?? true;
    public void Execute(object? parameter) => _execute();

    // Requerying CanExecute is driven by WPF's CommandManager; hooking it here
    // means the button auto-enables/disables as focus/input changes.
    public event EventHandler? CanExecuteChanged
    {
        add => CommandManager.RequerySuggested += value;
        remove => CommandManager.RequerySuggested -= value;
    }
}
