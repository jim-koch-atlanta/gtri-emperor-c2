using System.Collections.ObjectModel;
using System.Windows;
using System.Windows.Threading;

namespace operator_gui.ViewModels;

public sealed class MainViewModel : ObservableObject
{
    public ObservableCollection<RobotViewModel> Robots { get; } = new();

    private DispatcherTimer timer;
    private double t = 0.0;

    public MainViewModel()
    {
        RobotViewModel r1 = new RobotViewModel("R1")
        {
            CanvasX = 100,
            CanvasY = 100
        };

        RobotViewModel r2 = new RobotViewModel("R2")
        {
            CanvasX = 200,
            CanvasY = 200
        };

        RobotViewModel r3 = new RobotViewModel("R3")
        {
            CanvasX = 300,
            CanvasY = 300
        };

        RobotViewModel r4 = new RobotViewModel("R4")
        {
            CanvasX = 400,
            CanvasY = 400
        };

        RobotViewModel r5 = new RobotViewModel("R5")
        {
            CanvasX = 500,
            CanvasY = 500
        };

        RobotViewModel r6 = new RobotViewModel("R6")
        {
            CanvasX = 600,
            CanvasY = 600
        };

        Robots.Add(r1);
        Robots.Add(r2);
        Robots.Add(r3);
        Robots.Add(r4);
        Robots.Add(r5);
        Robots.Add(r6);

        timer = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(100) };
        timer.Tick += (s, e) => {
            t += 0.5; // 100 ms = 0.1 seconds
            for (int i = 0; i < Robots.Count; i++)
            {
                RobotViewModel r = Robots[i];
                r.X = (i + 1) * 100 + 10.0 * Math.Cos((1.0 / 10.0) * t);
                r.Y = (i + 1) * 100 + 10.0 * Math.Sin((1.0 / 10.0) * t);                
                (r.CanvasX, r.CanvasY) = WorldToCanvas(r.X, r.Y);
            }
        };
        timer.Start();
    }

    private (double, double) WorldToCanvas(double x, double y)
    {
        return (x, y);
    }
}