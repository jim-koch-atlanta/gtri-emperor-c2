# PROJECT_NOTES — gtri-emperor-c2

Session-to-session state. Terse, mechanism-level. Read after docs/TECH_SPEC.md.

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

## NEXT SESSION ENTRY POINT — Thu AM: WPF spike (timeboxed to midday, §12)

Goal: **`robot.proto` → C# via `Grpc.Tools`; one WPF window; dots moving from
live server data by noon.** Pass → WPF confirmed. Fail at the box → fallback
executes with no renegotiation: **TypeScript/React web UI** (§4). Do not let
sunk cost extend the box; warn at ~80%.

Concrete first steps:
1. On Windows: `dotnet new wpf -o operator_gui` under `gui/`.
2. Add `Grpc.Net.Client`, `Google.Protobuf`, `Grpc.Tools` packages; add
   `<Protobuf Include="..\proto\robot.proto" GrpcServices="Client" />` to the
   `.csproj` → C# stubs generate on `dotnet build`.
3. Stand up a throwaway server stub emitting `SwarmState` (or reuse the goose
   server shape) so the window has live data to plot on a `Canvas`.
4. Cross the WSL2↔Windows boundary over `localhost` (note the gRPC address:
   Windows client → WSL server may need the WSL IP, not `127.0.0.1`, depending
   on WSL networking mode — verify early, it's a classic time-sink).

`gui/` holds only a README right now — intentionally outside the CMake build
(Windows-side, dotnet toolchain).

---

## ACTION FOR JIM TONIGHT
- **Install the .NET 8 SDK on Windows** if not already done — the Thu-AM spike
  is blocked without it. Verify with `dotnet --version` in a Windows shell.
- Then **stop for the evening.**
