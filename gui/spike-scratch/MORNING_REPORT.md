# MORNING REPORT — WPF study prototype (overnight, Thu 2026-08-13)

> **THROWAWAY TEACHING PROTOTYPE — study, then REWRITE in the real spike. Do not
> copy wholesale.** Everything here lives in `gui/spike-scratch/` and is
> gitignored. It exists so this morning's real, timeboxed spike starts from
> understanding, not a blank window. Read it, then build the real thing clean.

---

## TL;DR (the 30-second version)

- **It works, standalone, no backend.** A .NET 8 WPF app renders 6 robots
  orbiting on the §2 circle equations at 5 Hz, with fading trails, heading
  ticks, a live roster, swarm health counts, selection sync (map ↔ roster),
  Fit All, mouse-wheel zoom, and drag-pan. One robot goes **STALE then LIVE**
  every ~20 s so you can see the watchdog UI.
- **`robot.proto` generates clean C#** via `Grpc.Tools` — **0 warnings**. That
  alone was worth the night: our proto is confirmed good on the C# side.
- **The whole thing builds `-warn`-clean** (0 warnings, 0 errors) and a headless
  `--selftest` proves the geometry + watchdog cycle are real (I couldn't
  screenshot — see Gotcha #6).
- **The real-spike plan is at the bottom.** Budget ~3–4 focused hours; you have
  a working mental model now, so this should fit inside the midday box with room.

---

## 1. Run it (do this first, with coffee)

Windows PowerShell (WPF is Windows-only; this dir is the Windows side):

```powershell
cd C:\dev\gtri-emperor-c2\gui\spike-scratch\EmperorGuiPrototype
dotnet run                 # FAKE feed — the default, zero dependencies
```

**What you should see** (there's no screenshot in this report — Gotcha #6):
- A dark window titled **“Emperor C2 — TACTICAL · FAKE FEED”**.
- **6 colored dots** (R-01…R-06) each tracing its own circle, each dragging a
  short **fading trail**; a small **heading tick** points along velocity.
- **Left roster**: colored bullet + `R-0x  LIVE  40 ms` rows. Top-right status
  bar: **`6 LIVE · 0 STALE · 0 LOST`**.
- **Every ~20 s** one robot (R-01 first, then R-02, …) freezes: it grays out and
  goes **dashed**, its roster row flips **STALE** with a **climbing age**
  (…1.0 s… 2.0 s…), the status bar shows `5 LIVE · 1 STALE`, then it **snaps
  back to LIVE** after ~3.5 s.
- **Click a dot _or_ a roster row** → a white **selection ring** appears on that
  dot and the **right panel** fills with its status / age / speed / radius
  (updating live). Selection stays in sync both directions.
- **Scroll** = zoom, **drag** = pan, **[Fit All]** = recenter on the swarm.

Other modes:

```powershell
dotnet run -- --grpc       # real feed: connects to http://localhost:50051
                           # (UNTESTED overnight — no server was running)
dotnet run -- --selftest   # headless pipeline check; writes selftest.log, exit 0/1
```

> Note the `--` : `dotnet run -- <args>` passes args to the app, not to the SDK.

The `--selftest` result from tonight (in `bin/Debug/net8.0-windows/selftest.log`):

```
frames consumed .......... 25   (expect ~25 at 5 Hz over 5 s)
robots tracked ........... 6    (expect 6)
screen bounds ............ x[-10,894] y[-166,780]  spread 904x946px
  -> finite, viewport-scale PASS
max trail length ......... 25   -> grew: PASS
watchdog STALE observed .. PASS   robots: R-01
watchdog STALE->LIVE ..... PASS   robots: R-01
RESULT: PASS -- tactical pipeline produces correct geometry + watchdog cycle.
```

---

## 2. WPF in 10 concepts — as actually used in *this* code

Read the files in this order; each concept is anchored to where it lives.

| # | Concept | Where, in this prototype | The one-liner |
|---|---------|--------------------------|---------------|
| 1 | **XAML tree + `x:Class` partial** | `MainWindow.xaml` ↔ `MainWindow.xaml.cs` | XAML and code-behind are two halves of **one** `partial class`; `InitializeComponent()` wires them. |
| 2 | **DataContext** | `App.xaml.cs` sets `window.DataContext = vm`; right panel re-roots it via `DataContext="{Binding SelectedRobot}"` | The object a `{Binding}` resolves against. It **inherits down** the tree until re-rooted. |
| 3 | **`{Binding}`** | `Text="{Binding StatusSummary}"` everywhere | One-way by default (VM→UI). `Mode=TwoWay` on `ListBox.SelectedItem` pushes UI→VM. |
| 4 | **INotifyPropertyChanged** | `Mvvm/ObservableObject.cs` | The engine behind “dots move.” No `PropertyChanged` → the UI reads a value **once** and never again. |
| 5 | **ObservableCollection** | `MainViewModel.Robots` | Raises `CollectionChanged` so `ItemsControl`/`ListBox` add/remove items automatically. **Must be mutated on the UI thread.** |
| 6 | **DataTemplate** | roster row *and* map dot, both in `MainWindow.xaml` | “How do I turn a `RobotViewModel` into pixels?” Same VM, two templates (list row vs. tactical glyph). |
| 7 | **Canvas attached properties** | `Canvas.Left/Top` on the dot/label/ring | `Canvas.Left` is a property Canvas *attaches* to its children for absolute placement. Canvas does **not** clip or measure children. |
| 8 | **ItemsPanel override** | `<ItemsControl.ItemsPanel><Canvas/>` | Swap the default vertical `StackPanel` layout for a `Canvas` so items place by coordinate, not stack order. |
| 9 | **Converters + StringFormat** | `BooleanToVisibilityConverter` (sel ring); `StringFormat='Age: {0}'` | Adapt a VM value to a UI type/shape without polluting the VM. |
| 10 | **Dispatcher marshaling + RenderTransform** | `MainViewModel.RunAsync` (marshaling); `Rendering/ViewTransform.cs` (why *not* RenderTransform) | See §3 and §4 below — the two ideas most worth getting right. |

---

## 3. THE THREADING IDIOM (the thing to get right)

A gRPC server stream — and our `FakeFeed` — deliver frames on a **background
thread**. WPF objects have **thread affinity**: an `ObservableCollection` bound
to the UI, and every `DispatcherObject`, may only be touched on the **UI
(Dispatcher) thread**. Touch them from the reader thread and you get:

> `InvalidOperationException: The calling thread cannot access this object
> because a different thread owns it.`
> (`ObservableCollection` specifically throws `NotSupportedException` on a
> cross-thread `CollectionChanged`.)

The pattern, in `MainViewModel.RunAsync`:

```csharp
await foreach (var frame in feed.Subscribe(ct).ConfigureAwait(false)) // READ off-UI
    _ui.Invoke(() => ApplyFrame(frame));                              // APPLY on-UI
```

- `ConfigureAwait(false)` = “don’t bother resuming on the UI thread here” — the
  whole point is to keep the read off it.
- `_ui.Invoke(...)` hops back to the UI thread for the mutation. **Delete it and
  the app throws on frame 1.** That’s the lesson.
- I used **`Invoke` (synchronous)** on purpose: the reader waits while the UI
  applies — natural backpressure, fine at 5 Hz. The non-blocking alternative is
  `BeginInvoke`/`InvokeAsync` (fire-and-forget); at high rates that can queue
  faster than the UI drains, which is exactly where **telemetry coalescing**
  (TECH_SPEC §7 — “a laggy GUI gets 10 → 50, not 10,20,30,40,50”) becomes the
  right answer. Nice thread to pull on for the defense.

`RobotViewModel.Project()` (which builds the `PointCollection` for the trail and
the frozen brushes) runs **inside** `ApplyFrame`, i.e. on the UI thread — so no
WPF object is ever created on the wrong thread. Brushes are `Freeze()`d anyway.

---

## 4. THE PROJECTION CHOICE (defend this)

**I project world→screen in the ViewModel** (`Rendering/ViewTransform.cs`,
`RobotViewModel.Project`) and draw **constant-size** glyphs in screen space —
rather than slapping a `RenderTransform` on the Canvas.

Why: a tactical display wants **positions to scale with zoom but symbols to stay
a constant pixel size**. A single `RenderTransform` scales *everything* — the
dots balloon, the text blurs. Projecting positions and drawing fixed-size dots
gives the correct behavior, and keeps the transform math as **plain, testable
code** (which is why `--selftest` can check it headlessly).

**When `RenderTransform` _is_ the right tool:** a single scalable content layer
where uniform scaling is *desired* — e.g. a **map-tile image** under the symbols
(TECH_SPEC stretch #2). Idiomatic recipe: `Canvas.RenderTransform` =
`MatrixTransform`; pan = `TranslateTransform`; zoom-about-cursor = compose a
`ScaleTransform` around the mouse point. Keep it on the *map layer*, keep the
*symbol layer* in VM projection. That split is worth stating out loud.

`Fit All` is just: bounding-box of the robots → scale = `margin * min(vw/W,
vh/H)` → recenter. It’s in `ViewTransform.Fit`.

---

## 5. Gotchas actually hit tonight (so you don’t re-hit them)

1. **NuGet had _no sources_.** `dotnet add package` failed with *“There are no
   versions available.”* The machine’s global `NuGet.Config` lists no feeds
   (`dotnet nuget list source` → *No sources found*), even though nuget.org is
   reachable. **Fix used:** a **local `nuget.config`** in the project dir
   (`<clear/>` + nuget.org). Kept it local to honor containment; the real spike
   should confirm the team’s canonical/internal feed instead of pinning
   nuget.org. **This will bite the real project too** — decide the feed early.
2. **XML comments can’t contain `--`.** My `<!-- ---- section ---- -->` dividers
   and a literal `--grpc` inside a comment broke the XAML compiler
   (`MC3000: An XML comment cannot contain '--'`). Use `====` dividers; don’t
   write `--flag` inside XAML comments.
3. **Proto enum names get rewritten in C#.** `LINK_LIVE` → `LinkStatus.LinkLive`,
   but `LINK_STATUS_UNSPECIFIED` → `Unspecified`. The generator strips only the
   **full enum-name prefix** (`LINK_STATUS_`), so partial-prefix values keep
   their prefix. Don’t assume the proto name; check the generated `Robot.cs`.
   (The C++ side keeps `LINK_LIVE` — the names differ across languages.)
4. **Well-known types just resolve.** `import "google/protobuf/timestamp.proto"`
   needed **no** extra include path — `Grpc.Tools` bundles the WKTs, mirroring
   the C++ note in PROJECT_NOTES. Set `ProtoRoot` when the `.proto` is outside
   the project dir (ours is `..\..\..\proto`) so generated file names stay clean.
5. **A `WinExe` doesn’t block the console.** `& app.exe --selftest` returns
   *immediately* and `$LASTEXITCODE` is meaningless. Use
   `Start-Process -Wait -PassThru` and read `.ExitCode`. (Matters if you script
   a headless check in CI.)
6. **No screenshot — this session had no interactive desktop.** `PrintWindow`
   grabbed only the native title bar (WPF renders on a DirectComposition surface
   it can’t capture); `CopyFromScreen` came back **all black** (nothing is
   actually composited to a visible framebuffer in a headless/detached session).
   That’s why I wrote `--selftest` to prove the pipeline instead. **On your real
   desktop the window renders normally** — just `dotnet run`.
7. **gRPC over cleartext HTTP/2 (h2c).** `GrpcFeed` targets `http://` (no TLS).
   `Grpc.Net.Client` speaks HTTP/2 prior-knowledge to an `http://` address,
   which the C++ server on `0.0.0.0:50051` accepts. If .NET ever refuses,
   set `AppContext.SetSwitch("System.Net.Http.SocketsHttpHandler.Http2Unencrypted
   Support", true)`. (Untested tonight — first live milestone this morning.)

---

## 6. What’s in the box (file map)

```
EmperorGuiPrototype/
  EmperorGuiPrototype.csproj   Grpc.Tools <Protobuf ... GrpcServices="Client"/>, ProtoRoot
  nuget.config                 local feed (Gotcha #1)
  App.xaml(.cs)                composition root; picks IFeed by arg; starts feed loop
  MainWindow.xaml(.cs)         the 3-pane view; code-behind = input plumbing only
  Mvvm/ObservableObject.cs     INotifyPropertyChanged base
  Mvvm/RelayCommand.cs         ICommand for [Fit All]
  Feed/IFeed.cs                the seam: IAsyncEnumerable<SwarmState>
  Feed/FakeFeed.cs             DEFAULT — 6 robots, §2 motion, seq, fake watchdog
  Feed/GrpcFeed.cs             REAL — OperatorFeed.Subscribe (compiles; untested)
  ViewModels/MainViewModel.cs  robots, selection, counts, transform, THREADING loop
  ViewModels/RobotViewModel.cs world truth -> screen geometry (Project)
  Rendering/ViewTransform.cs   world<->screen; Fit; zoom/pan helpers
  Rendering/ImmediateModeSketch.cs   NOT WIRED — the OnRender alternative (see §8)
  SelfTest.cs                  headless pipeline check (--selftest)
```

---

## 7. RECOMMENDED PLAN for the real spike (timeboxed to midday)

You now have the mental model, so the real build should be **fast and clean**.
Suggested order — **keep the green-at-every-step discipline**:

| Step | Time | Do |
|------|-----:|----|
| 0 | 5 m | `dotnet new wpf -o gui/operator_gui`. Decide the **NuGet feed** up front (Gotcha #1). |
| 1 | 15 m | Add `Grpc.Net.Client` + `Google.Protobuf` + `Grpc.Tools`; wire `<Protobuf Include="..\proto\robot.proto" ProtoRoot="..\proto" GrpcServices="Client"/>`; `dotnet build` → **proto compiles**. (Already proven tonight — should be frictionless.) |
| 2 | 20 m | `ObservableObject`, `MainViewModel`, `RobotViewModel` **from scratch** (don’t paste — retype so you own it). Get an empty window bound to an empty `Robots` collection. |
| 3 | 30 m | **GrpcFeed first** against your real C++ server (this is the actual spike goal — “dots from live server data”). Wire the **threading loop** (§3). One robot moving = spike **passed**. |
| 4 | 30 m | Tactical `ItemsControl` + `Canvas` ItemsPanel + dot DataTemplate + `ViewTransform` projection + Fit All. |
| 5 | 20 m | Roster `ListBox`, two-way selection sync, status-bar counts, trails + heading ticks + STALE styling. |
| 6 | 20 m | Zoom/pan; selection ring; right detail panel. |
| — | | **If the box is tight, stop after Step 3** and declare the spike passed — the rest is Friday GUI work, not spike risk. |

**Keep conceptually** (these were the right calls):
- The **`IFeed` seam** (Fake ↔ gRPC on one `IAsyncEnumerable<SwarmState>`
  pipeline) — it let the UI be built with zero backend and is the GUI-side echo
  of the §6 gateway seam. **A `FakeFeed` is worth keeping in the real project**
  for demoing/dev without the C++ stack.
- **VM-side projection** with constant-size symbols (§4).
- **Read-off-UI / apply-on-UI** marshaling (§3).
- Splitting **world truth** from **screen geometry** on the RobotViewModel.

**Do differently** in the real build:
- Use **`CommunityToolkit.Mvvm`** (`[ObservableProperty]`, `[RelayCommand]`
  source generators) instead of the hand-rolled `ObservableObject`/`RelayCommand`
  — less boilerplate, and it’s the idiom a reviewer expects.
- Don’t `RaiseAll()` (`PropertyChanged(string.Empty)`) every frame like I did —
  fine at 6 robots, but raise **per-property** so binding stays cheap as N grows.
- Prune `RobotViewModel`s for robots that drop out of `SwarmState` (I only ever
  add). Decide the policy (keep-as-LOST vs. remove).
- Consider moving the code-behind input handlers into **attached behaviors** if
  you want to say “zero code-behind” — but honestly, named handlers for raw
  input plumbing are defensible; don’t over-engineer for the demo.
- Wire the **command panel + status strip for real** (SendCommand → Accepted →
  live per-target `CommandStatus`) — tonight it’s a disabled sketch. This is the
  §5 centerpiece and deserves real time on **Friday**, not the spike.

---

## 8. The scaling escape hatch (sketched, not built)

`Rendering/ImmediateModeSketch.cs` compiles but is **not wired in**. It shows the
`OnRender(DrawingContext)` immediate-mode path for when the retained-mode
`ItemsControl` + per-robot visual subtree stops scaling — roughly the **low
thousands of moving tracks** (especially with long trails redrawn at rate),
where per-element layout/measure and per-frame binding churn dominate. At that
point: one `FrameworkElement`, draw all symbols in a single pass (you trade
WPF’s free hit-testing for doing it yourself). This is TECH_SPEC §9’s “Level of
detail” split — **GPU-backed view renders tracks; the UI framework renders
workflow.** Symbols → immediate mode; roster/panels/command strip → stay bound.
**Don’t build this for the take-home** (20 robots doesn’t need it); it’s a
sentence in the scaling-path story, and now you can say it concretely.

---

## 9. Open questions for your judgment (a throwaway can’t decide these)

1. **WPF vs. the React/MapLibre fallback.** The spike’s real question. Nothing
   tonight was painful *once past the NuGet-feed snag* — WPF is a fine fit for
   this UI. But the **map layer** (stretch #2) is genuinely easier in the web
   stack. If a real basemap matters to the story, weigh that this morning.
2. **Fit All: instantaneous vs. swept extent.** Fitting the current snapshot
   lets orbiting robots drift out of view (you saw it in the selftest bounds).
   Telemetry carries *position, not orbit center*, so you can’t fit the full
   circle from one frame — you’d fit from **accumulated trail extent**, or add a
   “Follow selected” auto-recenter. Which behavior do you want to demo?
3. **Coalescing vs. render-every-frame.** At 20 robots × 5 Hz, `Invoke`
   per-frame is fine. Do you want to *show* the coalescing discipline (§7) in the
   GUI, or keep it a backend/architecture talking point? (It’s a strong point to
   *say*; building it into the GUI is scope you may not need.)
4. **Selection model depth.** I did single-select. The spec wants **Ctrl-click
   multi-select** driving a multi-target command (“APPLY TO 3 ROBOTS”). Cheap in
   WPF (`ListBox SelectionMode="Extended"` + a selected-set on the VM), but it’s
   Friday command-panel work — confirm it’s in the demo cut.
5. **NuGet feed** (repeating because it’ll block you): pick the real feed before
   Step 1 or you’ll lose 10 minutes to Gotcha #1.

---

*Written ~05:00-ish Thu 2026-08-13 by the overnight session. Build: 0 warnings /
0 errors. `--selftest`: PASS. Nothing outside `gui/spike-scratch/` changed except
one `.gitignore` line. Go get coffee, then build the real one.*
