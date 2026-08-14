# operator_gui (Windows-side)

C# / .NET 8 / WPF operator client. **Not part of the CMake build** — it lives
on the Windows side of the WSL2↔Windows boundary and builds with the dotnet
CLL (`dotnet build`), consuming `proto/robot.proto` via `Grpc.Tools` codegen.

See TECH_SPEC §4 (operator_gui) and §12 (Thu-am WPF spike, timeboxed to
midday; fallback = TypeScript/React web UI).

Contents land during the Thursday spike:
- `.csproj` referencing `Grpc.Net.Client`, `Google.Protobuf`, `Grpc.Tools`
  (with `<Protobuf Include="..\proto\robot.proto" GrpcServices="Client" />`)
- MVVM: `SwarmState` subscription → `ObservableCollection` of robot VMs
- Tactical view (Canvas ItemsControl), roster, selection, command panel,
  status strip.
