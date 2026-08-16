// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// A Source is anything that produces SwarmState frames and accepts commands.
// Two implementations: GrpcSource (the real C2 server) and FakeSource (a
// self-contained simulator). index.ts wires whichever one to the WebSocket fan-
// out, so the web client is identical against either — the same seam idea the
// C2 core uses for its RobotGateway (TECH_SPEC §6), one layer out.

import type { SwarmState, CommandIntent, Accepted } from "./types.js";

export interface Source {
  readonly kind: "grpc" | "fake";
  start(): void;
  stop(): void;
  onFrame(cb: (state: SwarmState) => void): void;
  onStatus(cb: (connected: boolean, detail: string) => void): void;
  sendCommand(intent: CommandIntent): Promise<Accepted>;
}
