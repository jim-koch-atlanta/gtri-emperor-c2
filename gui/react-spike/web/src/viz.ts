// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Shared visual vocabulary so the map paint expressions and the DOM panels agree
// on exactly one color per state. Traffic-light status semantics (green=healthy).
// A production build would validate these for contrast + color-vision deficiency;
// here they're the GitHub-dark palette, which is at least dark-UI legible.

import type { LinkStatus, CommandState } from "./types";

export const STATUS_COLOR: Record<LinkStatus, string> = {
  LINK_LIVE: "#3fb950",
  LINK_STALE: "#d29922",
  LINK_LOST: "#f85149",
  LINK_STATUS_UNSPECIFIED: "#8b949e",
};

export const CMD_COLOR: Record<CommandState, string> = {
  CMD_PENDING: "#8b949e",
  CMD_SENT: "#58a6ff",
  CMD_APPLIED: "#3fb950",
  CMD_REJECTED: "#f85149",
  CMD_EXPIRED: "#d29922",
  CMD_ROBOT_OFFLINE: "#f85149",
  CMD_STATE_UNSPECIFIED: "#8b949e",
};

export const shortStatus = (s: LinkStatus) => s.replace("LINK_", "");
export const shortCmd = (s: CommandState) => s.replace("CMD_", "");

// Mission geometry palette. Union fence in cyan (distinct from the green/amber/red
// status colors); component buffers tinted by role.
export const FENCE_UNION_COLOR = "#39c5cf";
export const INPUT_COLOR = "#c9d1d9";
export const BUFFER_COLOR: Record<string, string> = {
  fence_launch_point: "#3b82f6",
  fence_ingress_route: "#14b8a6",
  fence_region_of_interest: "#a855f7",
};

// Alert severity palette (Feature 2).
export type Severity = "info" | "warn" | "critical";
export const SEVERITY_COLOR: Record<Severity, string> = {
  info: "#58a6ff",
  warn: "#d29922",
  critical: "#f85149",
};
