using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace operator_gui;

public sealed class StatusToBrushConverter : IValueConverter
{
    // react-spike palette (LIVE green / STALE amber / LOST red / muted).
    static readonly Brush Live  = Freeze("#3fb950");
    static readonly Brush Stale = Freeze("#d29922");
    static readonly Brush Lost  = Freeze("#f85149");
    static readonly Brush Muted = Freeze("#8b949e");

    static Brush Freeze(string hex)
    {
        var b = (SolidColorBrush)new BrushConverter().ConvertFromString(hex)!;
        b.Freeze();
        return b;
    }

    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => (value as string) switch
        {
            "LIVE"  => Live,
            "STALE" => Stale,
            "LOST"  => Lost,
            _       => Muted,      // PENDING / unknown
        };

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();   // one-way only
}
