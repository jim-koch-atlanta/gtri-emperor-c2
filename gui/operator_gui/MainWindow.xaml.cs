using System.Text;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Documents;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Navigation;
using System.Windows.Shapes;
using operator_gui.ViewModels;

namespace operator_gui;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    private void Dot_Click(object sender, MouseButtonEventArgs e) {
        if (sender is FrameworkElement fe &&
            fe.DataContext is RobotViewModel robot &&
            DataContext is MainViewModel vm)
        {
            if ((Keyboard.Modifiers & ModifierKeys.Control) == ModifierKeys.Control)
                vm.ToggleSelection(robot);
            else
                vm.SetSelection(new[] { robot });
        }
    }
}