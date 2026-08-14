# PROJECT_NOTES — gtri-emperor-c2

Session-to-session state. Terse, mechanism-level. Read after docs/TECH_SPEC.md.

---

## Backend session (Thu 2026-08-13 pm, ~3.75h) — where we stopped

**GREEN (built + tested, -Wall -Wextra clean):**
- **Organ 1 — gateway seam** (`src/core/grpc_robot_gateway.{hpp,cpp}`): domain
  types (`namespace c2`, NOT `emperor` — that's the proto package, collides),
  `GrpcRobotGateway : RobotLink::Service`. Link() registers per-robot LinkState
  on first telemetry, routes Uplink oneof via `kind_case()` to
  on_telemetry_/on_command_result_ callbacks, goose writer-thread for fan-down.
  Registry mutex-guarded on all paths. **Committed.**
- **Organ 2 — robot_sim** (`src/robot_sim/main.cpp`): CLI
  `robot_id x0 y0 R V theta0 [addr]`; single-writer funnel (main writes
  telemetry @10Hz + drains result queue; reader jthread applies under mutex,
  enqueues result). Motion: φ=V/R·t+θ₀, heading=φ+π/2. Partial apply, R≤0
  rejected. **Committed.**
- **Organ 3a — TrackStore** (`src/core/track_store.{hpp,cpp}` + test):
  `map_mutex_` + `unordered_map<string, shared_ptr<Track>>`, `Track{mutex;
  RobotTelemetry latest;}`. Latest-wins BY SEQ; two-level locking. gtests
  green (§10). **UNCOMMITTED.**
- **Organ 3b — LinkWatchdog** (`src/core/link_watchdog.{hpp,cpp}` + test):
  per-robot LIVE/STALE/LOST on server monotonic receive time (passed in, not
  robot ts, not wall clock). No timer thread — pure function of age at 5Hz
  assembly; recovery automatic. Thresholds 1.5s/10s configurable, half-open
  edges. 6 gtests green (§10 exact thresholds). **UNCOMMITTED.**

**Gotchas banked this session (all real, all bit us):**
- `std::numbers::pi`, NOT `M_PI` — strict `-std=c++20` hides M_PI behind
  `__USE_MISC`. Include `<numbers>`.
- **gRPC stream = 1 reader + 1 writer, never 2 writers.** robot_sim's reader
  thread must NOT write CommandResults itself → enqueue, main-thread writer
  drains. (Dual of the server's Link.)
- TrackStore per-`Track` mutex does NOT protect the map → need `map_mutex_`
  too. find-or-create must be ONE atomic lock hold.
- proto fields are accessor *methods* (`t.robot_id()`); timestamp needs
  chrono↔`google::protobuf::Timestamp` split (seconds + nanos remainder).

**NOT STARTED — backend remaining (this is where Organ 3 continues):**
- **Organ 3c — CommandTracker:** §5 lifecycle PENDING→SENT→APPLIED +
  REJECTED/EXPIRED/ROBOT_OFFLINE; OperatorCommand→per-robot RobotCommand
  fan-out; terminal-state retention window (bounded SwarmState.commands).
- **Organ 4 — OperatorFeed:** Subscribe = server-stream SwarmState @5Hz
  (assembled from organs, seq monotonic); SendCommand = validate + tracker
  custody + return Accepted{command_id} immediately (custody ≠ delivery).
- **Organs 5–7:** launch_swarm.sh; integration tests (§10); gates (ASan/UBSan,
  TSan on multi-link w/ adapted tsan.supp, CI).

### >>> DONE Fri 2026-08-14 am: Organs 4 (OperatorFeed) + 5 (launch_swarm) <<<
**Backend is END-TO-END LIVE and smoke-verified.** server + N robot_sims →
SwarmState streaming @5Hz to a subscriber: robots LINK_LIVE, positions orbiting,
age_ms ~70ms, seq monotonic. Verified via `tools/subscribe_probe`.

- **Organ 4 — OperatorFeed** (`src/c2_server/operator_feed_service.{hpp,cpp}` +
  `main.cpp`): Subscribe = 5Hz loop (sweepExpired → store.snapshot +
  watchdog.classify per robot + tracker.snapshot → domain→proto → Write; break on
  Write()==false, per-subscriber seq). SendCommand routes THROUGH
  `tracker.onCommandSubmitted` (fan-out + ROBOT_OFFLINE) → dispatch via gateway →
  onCommandSent (custody ≠ delivery). main.cpp hosts BOTH services on one
  ServerBuilder @ 0.0.0.0:50051; callbacks on_telemetry_ = upsert +
  watchdog.record(steady), on_command_result_ = tracker.onCommandResult(system).
  **Committed.**
- **Organ 5 — launch_swarm.sh** (`tools/`): builds, launches server + N robots
  (varied params), health-checks via subscribe_probe, then `wait`s until Ctrl-C →
  trap teardown. **UNCOMMITTED (tools/).**
- **GUI merged** from gui-spike-jim (source only; obj/ gitignored; README kept).

**NOT smoke-tested e2e:** the command path (SendCommand → PENDING→SENT→APPLIED +
circle-widen). Unit-tested (CommandTracker's 6 gtests) and SendCommand routes
through the tracker, but nothing *sends* a command yet — that's the GUI's job.

### >>> NEXT ENTRY POINT: Organ 6 (integration tests §10) + Organ 7 (gates) <<<
- **Organ 6 — integration tests (§10, headless):** 3 LIVE; SIGSTOP→STALE→LOST→
  CONT; 2-target SetParameters→both APPLIED; STALE-robot cmd→EXPIRED; LOST-robot
  cmd→ROBOT_OFFLINE. Orchestrate like launch_swarm; assert on subscribe_probe
  output (or a gtest harness that spawns server + robots + a SendCommand caller).
- **Organ 7 — gates:** ASan/UBSan on the suite; **TSan on the multi-link server
  paths** (adapt tsan.supp from atas-prep — grpc/absl/event_engine suppressions);
  confirm CI stays green (emperor_c2_server + subscribe_probe now build in CI).

**DRY debt:** chrono↔proto-Timestamp conversion lives in 3 places now (gateway,
robot_sim, operator_feed). Lift to an inline `core/time_util.hpp` when convenient
(flagged in the operator_feed comment).

NB clock split: watchdog uses steady_clock (monotonic); CommandTracker + event
timestamps use system_clock. Don't cross them.

Note: Thu-pm "backend complete" slipped — tracker + feed remain. Fri must
either finish backend first or re-plan GUI vs backend split.

---

## GUI — GrpcFeed feed seam DONE (Fri 2026-08-14, ~30 min micro-session)

**Built (build green 0/0, warning-clean; FakeFeed path verified running;
GrpcFeed path awaits the live milestone run below):**
- `Feed/IFeed.cs` — the seam: `IAsyncEnumerable<Emperor.SwarmState> Subscribe(ct)`.
  Both feeds yield the SAME generated `SwarmState` currency; feed choice changes
  nothing downstream.
- `Feed/FakeFeed.cs` — Thursday's 6-circle motion, now emitted as SwarmState
  frames @ ~10 Hz. Default; app runs standalone with no server.
- `Feed/GrpcFeed.cs` — GrpcChannel → `http://localhost:50051`,
  `OperatorFeed.Subscribe` → `ReadAllAsync`. h2c switch set in a static ctor
  (gotcha #7). Server must bind `0.0.0.0` (it does).
- `MainViewModel` — **idiom 1** background-task stream reader + **idiom 2**
  `Dispatcher.InvokeAsync` marshal (both commented for the ownership review;
  marshal justified in-comment: feed layer stays WPF-free, marshal lives in the
  WPF-aware VM). Upsert-by-robot_id; position via `WorldToCanvas` (identity,
  unchanged); Status + Age from RobotState. Stream end/error → StatusText, no
  crash. StatusText bound to window Title.
- `App.OnStartup` injects the feed (`--grpc` arg | `EMPEROR_FEED=grpc` | default
  Fake). Removed XAML `<Window.DataContext>` — the DI seam is the point.
- `RobotViewModel` — added `Age`; fixed the 2 CS8618 warnings (Id get-only,
  `_Status` defaulted). Build is now warning-clean.

**MILESTONE (Jim runs, live):** `tools/launch_swarm.sh 3` in WSL, then
`operator_gui.exe --grpc` on Windows → real C++ robots stream into the window.
Expect dots near the TOP (centers at world y=0 = window top; identity transform;
top halves clipped). Framing is Saturday's Fit All — milestone = real data
flowing, which moving dots prove.

### >>> SATURDAY ENTRY POINT (GUI) <<<
1. **Ownership review of GrpcFeed** — the two idiom comments are written for this
   reader; read them aloud, make sure you can defend the thread story.
2. **Gates-lite (~20 min):** warning-clean (done); run under both feeds; confirm
   graceful stream-end (kill the server → Title shows "feed error…", no crash).
3. **Centerpiece §5:** command panel + status strip (SendCommand → per-target
   PENDING→SENT→APPLIED, circle-widen). The question's centerpiece.
- **send_command_probe STILL OWED** — backend routes SendCommand through the
  tracker but nothing *sends* yet; needed for §10 integration AND the GUI cmd path.
- Real `WorldToCanvas` (scale+offset+Fit All) so robots are framed, not top-clipped.

---

## Status board (as of Wed 2026-08-12, skeleton session)

**GREEN (validated locally):**
- Repo skeleton on the Q1 pattern: root `CMakeLists.txt` (C++20, `emperor_c2_warnings`
  INTERFACE lib, `EMPEROR_C2_SANITIZE` option), per-dir `proto/ src/ tests/`.
- `proto/robot.proto` — full §4 protocol. protoc + gRPC C++ codegen at build
  time → `emperor_c2_proto` lib. Both `c2_server` and `robot_sim` link it and run.
- `emperor_c2_tests`: `TelemetryProto.RoundTrip` — ctest **1/1 green**.
- CI workflow `.github/workflows/main.yaml` written (single job, apt toolchain).

**UNVERIFIED:**
- CI has **not** run yet — validates only on first push to GitHub. See risk below.

**NOT STARTED (this is a skeleton — no domain logic yet):**
- Everything in §4–§8: gateway seam, track store, watchdog, command tracker,
  motion model, operator feed, launcher. Server organs are Thu-pm work (§12).

---

## How to build (local)

```bash
cmake -B build -DCMAKE_PREFIX_PATH=$HOME/.local   # gRPC 1.82 / protoc v35 live here
cmake --build build --parallel
(cd build && ctest --output-on-failure)
```
Binaries: `build/src/c2_server`, `build/src/robot_sim` (NOT nested in a subdir).

## Mechanism notes / gotchas

- **Toolchain discovery is dual-mode** (`proto/CMakeLists.txt`): CONFIG-first
  (`find_package(... CONFIG QUIET)`) for local `$HOME/.local`, with fallbacks
  for apt — MODULE `FindProtobuf` for protoc, and pkg-config `grpc++` +
  `find_program(grpc_cpp_plugin)` for gRPC. Local build exercises the CONFIG
  path; CI will exercise the fallbacks (Ubuntu's `libgrpc++-dev` historically
  ships **no** `gRPCConfig.cmake`, so the pkg-config branch is expected to fire).
- **Generated code is SYSTEM-included** (`target_include_directories(... SYSTEM ...)`)
  so `-Wall -Wextra` on our targets never flags `.pb.h`. Warnings lib is applied
  to our code only, never to `emperor_c2_proto` or gtest.
- **Well-known types** (`google/protobuf/timestamp.proto`) resolve with only
  `-I proto/` — protoc finds them relative to its own install. True for both
  `$HOME/.local` protoc and apt protoc; no extra `-I` needed.
- **Enum value names are file-global in proto3** — that's why `ResultCode`
  (`RESULT_*`) and `CommandState` (`CMD_*`) use distinct prefixes; they'd
  collide otherwise. Don't "tidy" them to bare APPLIED/REJECTED.

### CI risk to watch on first push
If Actions fails at Configure/Build, the likely cause is the apt gRPC/protobuf
discovery. The fallback block is written for it, but it's the one path not
locally exercised. If it breaks: check whether `pkg-config --exists grpc++`
succeeds on the runner, and whether `find_package(Protobuf MODULE)` picks up the
apt protoc. protoc **version skew** (apt vs local v35) is a non-issue — codegen
is fresh in-CI and robot.proto uses only long-stable proto3 features.

---

## WPF SPIKE — PASSED (Thu 2026-08-13, ~2h session)

**VERDICT: PASS.** Six dots orbit in a native WPF window, driven by Jim's own
code. **WPF is confirmed as the operator-GUI stack** — the TypeScript/React
fallback (§4) is NOT needed.

**GREEN (built + ran locally; 0 errors, 2 nullable warnings — see gotchas):**
- `gui/operator_gui` — .NET 8 WPF (`net8.0-windows`), separate from the CMake
  build (Windows/dotnet side).
- **`robot.proto` → C# stubs via `Grpc.Tools` in *this* project** (Robot.cs /
  RobotGrpc.cs under obj/). The proto seam is proven on the real GUI project,
  not just the throwaway. csproj line:
  `<Protobuf Include="..\..\proto\robot.proto" ProtoRoot="..\..\proto" GrpcServices="Client" />`
  Packages: Grpc.Net.Client + Google.Protobuf + Grpc.Tools. (Note the path is
  `..\..\` — operator_gui sits directly under gui/, unlike the scratch project.)
- MVVM foundation, **all typed by Jim:**
  - `ObservableObject` — INotifyPropertyChanged + `SetField<T>` with `[CallerMemberName]`.
  - `RobotViewModel` — Id, X, Y, CanvasX, CanvasY, Heading, Status.
  - `MainViewModel` — `ObservableCollection<RobotViewModel>`.
  - `MainWindow.xaml` — ItemsControl + Canvas ItemsPanel + DataTemplate
    (ellipse + label) + **ItemContainerStyle** binding Canvas.Left/Top.
  - Motion — `DispatcherTimer` @ 10 Hz (100 ms) mutating VM props ON THE UI
    THREAD. No background thread / marshaling today — deliberate (see Friday).
  - `WorldToCanvas(x,y)` — identity today; the seam for scale/offset + pan/zoom.

**WPF concepts Jim now OWNS (typed them, can defend Monday):**
- INotifyPropertyChanged + SetField/[CallerMemberName]; **binding targets
  PROPERTIES, never fields** (learned via a live bug — fields bind silently to nothing).
- DataContext wiring (XAML `<Window.DataContext><vm:MainViewModel/>`), and
  clr-namespace / `xmlns:vm` so XAML resolves VM types.
- ObservableCollection as the bindable list.
- ItemsControl / ItemsPanel(Canvas) / DataTemplate / **ItemContainerStyle** —
  and the WHY: a Canvas positions its DIRECT children (the generated
  `ContentPresenter` container), not the templated ellipse; so Canvas.Left/Top
  binds on the container via ItemContainerStyle, not in the template.
- Canvas attached properties (incl. dotted `Property="Canvas.Left"` in a Setter).
- **DispatcherTimer ticks on the UI thread → no marshaling.** Thread affinity =
  "UI objects are touched only on the UI thread," and it's the THREAD that
  matters, not where in the code the line lives.
- world→canvas transform as a seam separating model coords from pixels.

**Deferred / still-simple (scoped OUT of the spike, not bugs):**
- Motion is uniform (same R/V/θ, centers on a diagonal). Distinct params belong
  to the C++ robot_sim processes; FakeFeed just stands in. (Jim's framing:
  "the operator client is a renderer; motion lives in the robot processes.")
- `WorldToCanvas` is identity (scale=1, no offset/flip). X/Y now carry world
  meaning but the transform is a no-op.
- No trails / selection / roster / command panel / styling / GrpcFeed yet.

**Gotchas hit:**
- **NuGet had NO package source** ("No sources found") → must run
  `dotnet nuget add source https://api.nuget.org/v3/index.json -n nuget.org`
  before packages resolve. (Confirms MORNING_REPORT gotcha #1 — decide the
  team's real feed.)
- Binding to public **fields** does nothing → must be properties.
- Copy-paste in the ctor (r1/r1/r1 receivers) → dots stacked at (0,0): the
  classic "one dot at origin" symptom.
- `Heading` getter self-reference (`get => Heading`) → infinite recursion /
  StackOverflow landmine; fixed.
- Pre-existing empty `gui/operator_gui/` dir → `dotnet new wpf --force`.
- **OPEN (2 warnings): CS8618 nullable** on `_Id`/`_Status` in RobotViewModel —
  nullable flow analysis doesn't credit SetField's `ref` assignment. 30-sec
  fix: make `Id` a get-only auto-prop (never changes) + default `_Status = ""`.
  Clean before Friday to hold the warning-clean gate.

---

## NEXT SESSION ENTRY POINT — Fri: GUI completion on today's WPF foundation

Build order (each green before the next), per TECH_SPEC §3 / §12:

1. **`GrpcFeed` against the REAL C++ server FIRST** (before roster/selection).
   - **This is where today's deferred threading lands, WITH a concrete reason:**
     the gRPC server stream delivers `SwarmState` on a **background thread**, so
     setting VM props there crosses the thread boundary → NOW you marshal back
     to the UI thread (`Dispatcher.InvokeAsync` or a captured
     `SynchronizationContext`; pick one, justify it). Today's DispatcherTimer
     needed none of that because it already ticked on the UI thread — swap the
     timer's role for a stream reader that marshals.
   - Put it behind an `IFeed` seam (FakeFeed | GrpcFeed) so the app still runs
     standalone; pipeline currency = generated `Emperor.SwarmState`.
   - **Boundary (pre-verified Wed):** client = `http://localhost:50051`; the C++
     server MUST bind `0.0.0.0:50051` (NOT 127.0.0.1) for WSL2 localhost
     forwarding. h2c cleartext HTTP/2 (MORNING_REPORT gotcha #7). WSL IP
     fallback `hostname -I` if localhost ever regresses (don't hardcode).
2. Then TECH_SPEC §3: roster ListBox + two-way selection sync (map↔roster),
   status-bar LIVE/STALE/LOST counts, then trails, then command panel + status
   strip (§5, the centerpiece).
3. Real world→canvas transform (scale + offset + Fit All) once positions arrive
   from the server frame; pan/zoom after that.

**Reference only, NEVER copy:** `gui/spike-scratch/` + `MORNING_REPORT.md` —
last night's throwaway shows all of the above assembled. Study the shape, then
write clean in `gui/operator_gui/`.
