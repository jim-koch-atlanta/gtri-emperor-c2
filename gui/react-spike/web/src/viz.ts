// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
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
