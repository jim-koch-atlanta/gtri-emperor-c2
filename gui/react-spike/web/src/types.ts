// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Copied from the bridge's types.ts (deliberately — web/ and bridge/ are two
// independent npm packages; a shared module would mean a workspace, overkill for
// a throwaway). These are the JSON shapes that cross the WebSocket, mirroring
// robot.proto (TECH_SPEC §4) under proto-loader's keepCase decoding.

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
  speed: number;
  radius: number;
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

export interface CommandIntent {
  command_id?: string; // client-minted correlation id (round 3)
  targets: string[];
  params: {
    speed?: number;
    radius?: number;
    center_x?: number;
    center_y?: number;
    theta?: number;
  };
}

export type ServerMessage =
  | { type: "swarm"; state: SwarmState }
  | { type: "status"; connected: boolean; source: "grpc" | "fake"; detail: string }
  | { type: "ack"; command_id: string; accepted: boolean; detail: string };
