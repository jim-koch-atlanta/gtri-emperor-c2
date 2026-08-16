// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Wire shapes shared by the bridge and (by copy) the web client. These mirror
// robot.proto (TECH_SPEC §4) 1:1 under proto-loader's keepCase decoding, so the
// JSON that crosses the WebSocket is just SwarmState with snake_case fields.

export interface Timestamp {
  seconds: number;
  nanos: number;
}

export interface Telemetry {
  robot_id: string;
  seq: number;
  timestamp?: Timestamp;
  x: number;
  y: number;
  heading: number;
  speed: number; // V
  radius: number; // R
}

export type LinkStatus =
  | "LINK_STATUS_UNSPECIFIED"
  | "LINK_LIVE"
  | "LINK_STALE"
  | "LINK_LOST";

export interface RobotState {
  telemetry: Telemetry;
  link_status: LinkStatus;
  age_ms: number;
}

export type CommandState =
  | "CMD_STATE_UNSPECIFIED"
  | "CMD_PENDING"
  | "CMD_SENT"
  | "CMD_APPLIED"
  | "CMD_REJECTED"
  | "CMD_EXPIRED"
  | "CMD_ROBOT_OFFLINE";

export interface TargetStatus {
  robot_id: string;
  state: CommandState;
  detail: string;
}

export interface CommandStatus {
  command_id: string;
  targets: TargetStatus[];
}

export interface SwarmState {
  seq: number;
  server_time?: Timestamp;
  robots: RobotState[];
  commands: CommandStatus[];
}

// Operator intent, sent web -> bridge. The bridge (the gateway) is what turns
// this into a proto OperatorCommand: it mints the command_id, stamps timestamp
// and expiry, and speaks gRPC. The browser never touches proto or clocks.
export interface CommandIntent {
  command_id?: string; // client may mint its own correlation id (round 3)
  targets: string[];
  params: {
    speed?: number;
    radius?: number;
    center_x?: number;
    center_y?: number;
    theta?: number;
  };
}

export interface Accepted {
  command_id: string;
  accepted: boolean;
  detail: string;
}

// ---- WebSocket envelopes (bridge <-> web) --------------------------------

export type ServerMessage =
  | { type: "swarm"; state: SwarmState }
  | { type: "status"; connected: boolean; source: "grpc" | "fake"; detail: string }
  | { type: "ack"; command_id: string; accepted: boolean; detail: string };

export type ClientMessage = { type: "command"; intent: CommandIntent };
