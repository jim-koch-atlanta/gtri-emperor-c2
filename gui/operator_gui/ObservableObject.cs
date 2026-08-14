using System.ComponentModel;
using System.Runtime.CompilerServices;

namespace operator_gui;

public abstract class ObservableObject : INotifyPropertyChanged
{
    public  event PropertyChangedEventHandler? PropertyChanged;

    protected bool SetField<T>(ref T field, T value, [CallerMemberName] string? name = null)
    {
        if (EqualityComparer<T>.Default.Equals(field, value)) return false; // no-op if unchanged
        field = value;
        PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
        return true;
    }
}