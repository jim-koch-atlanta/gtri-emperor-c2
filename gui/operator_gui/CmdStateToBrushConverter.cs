using System.Globalization;
using System.Windows.Data;
using System.Windows.Media;

namespace operator_gui;

public sealed class CmdStateToBrushConverter : IValueConverter
{
    public object Convert(object value, Type t, object p, CultureInfo c) => (value as string) switch
    {
        "PENDING"  => Brushes.Gray,
        "SENT"     => Brushes.SteelBlue,
        "APPLIED"  => Brushes.SeaGreen,
        "REJECTED" => Brushes.Firebrick,
        "EXPIRED"  => Brushes.DarkOrange,
        "OFFLINE"  => Brushes.DimGray,
        _          => Brushes.Gray,
    };

    public object ConvertBack(object value, Type t, object p, CultureInfo c)
        => throw new NotSupportedException();
}
