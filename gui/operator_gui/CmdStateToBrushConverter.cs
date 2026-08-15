using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace operator_gui;

public sealed class CmdStateToBrushConverter : IValueConverter
{
    // react-spike palette, mapped to the command lifecycle states.
    static readonly Brush Pending  = Freeze("#8b949e");   // muted
    static readonly Brush Sent     = Freeze("#58a6ff");   // accent blue
    static readonly Brush Applied  = Freeze("#3fb950");   // live green
    static readonly Brush Rejected = Freeze("#f85149");   // lost red
    static readonly Brush Expired  = Freeze("#d29922");   // stale amber
    static readonly Brush Offline  = Freeze("#6e7681");   // dim

    static Brush Freeze(string hex)
    {
        var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
        b.Freeze();
        return b;
    }

    public object Convert(object value, Type t, object p, CultureInfo c) => (value as string) switch
    {
        "PENDING"  => Pending,
        "SENT"     => Sent,
        "APPLIED"  => Applied,
        "REJECTED" => Rejected,
        "EXPIRED"  => Expired,
        "OFFLINE"  => Offline,
        _          => Pending,
    };

    public object ConvertBack(object value, Type t, object p, CultureInfo c)
        => throw new NotSupportedException();
}
