using System;
using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace operator_gui;

public sealed class StatusToBrushConverter : IValueConverter
{
    public object Convert(object value, Type targetType, object parameter, CultureInfo culture)
        => value as string switch
        {
            "LIVE"  => Brushes.LimeGreen,
            "STALE" => Brushes.Gold,
            "LOST"  => Brushes.Red,
            _       => Brushes.Gray,      // PENDING / unknown
        };

    public object ConvertBack(object value, Type targetType, object parameter, CultureInfo culture)
        => throw new NotSupportedException();   // one-way only
}
