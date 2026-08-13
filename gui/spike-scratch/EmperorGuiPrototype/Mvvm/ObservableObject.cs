// THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not copy wholesale.
//
// The minimal INotifyPropertyChanged base every WPF ViewModel needs. WPF data
// binding listens to PropertyChanged; without it, the UI reads a value once at
// bind time and never updates. This is the whole engine behind "dots move."
using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace EmperorGuiPrototype.Mvvm;

public abstract class ObservableObject : INotifyPropertyChanged
{
    public event PropertyChangedEventHandler? PropertyChanged;

    // [CallerMemberName] auto-fills the property name from the calling setter,
    // so we write `Set(ref _x, value)` with no magic strings to drift.
    protected bool Set<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false;
        field = value;
        Raise(name);
        return true;
    }

    protected void Raise([CallerMemberName] string? name = null)
        => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));

    // Passing string.Empty tells WPF "every binding on this object is stale."
    // Pragmatic at 6 robots; a real view would raise per-property to avoid
    // re-evaluating every binding each frame. Called out in MORNING_REPORT.md.
    protected void RaiseAll() => Raise(string.Empty);
}
