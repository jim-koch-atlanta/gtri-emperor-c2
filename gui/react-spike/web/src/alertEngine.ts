// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// AlertEngine — supervision by exception (TECH_SPEC §9 "attention management").
// A PURE, unit-testable state machine: feed it SwarmState frames, it returns the
// NEW alerts each frame produces. No React, no DOM, no timers, no clock of its own
// (the caller passes `now`). Three rule families:
//   * link transitions      LIVE→STALE (warn) · →LOST (critical) · recovery (info)
//   * command terminal fails REJECTED / EXPIRED / ROBOT_OFFLINE (warn), once each
//   * geofence breach        robot leaves the union fence (critical) · re-entry (info)
// Debounce is by STATE CHANGE: a robot orbiting across the boundary emits one alert
// per crossing, never per frame. The point-in-fence test is injected so the engine
// stays free of turf/geo and is trivially testable.

import type { SwarmState, LinkStatus, CommandState } from "./types";
import type { Severity } from "./viz";

export type AlertKind = "link" | "command" | "geofence";

export interface Alert {
  id: string;
  kind: AlertKind;
  severity: Severity;
  ts: number; // client ms (caller-supplied)
  robotId: string;
  message: string;
}

const TERMINAL_FAILURES: CommandState[] = ["CMD_REJECTED", "CMD_EXPIRED", "CMD_ROBOT_OFFLINE"];

export class AlertEngine {
  private prevLink = new Map<string, LinkStatus>();
  private prevInside = new Map<string, boolean>();
  private seenCmdTargets = new Set<string>(); // `${command_id}:${robot_id}` already alerted
  private seq = 0;

  /** insideFence: robot local E/N metres -> is it inside the geofence? */
  constructor(private insideFence: (x: number, y: number) => boolean) {}

  ingest(frame: SwarmState, now: number): Alert[] {
    const out: Alert[] = [];

    for (const r of frame.robots) {
      const id = r.telemetry.robot_id;

      // ---- link transitions ----
      const prevStatus = this.prevLink.get(id);
      if (prevStatus !== undefined && prevStatus !== r.link_status) {
        const a = this.linkAlert(id, prevStatus, r.link_status, now);
        if (a) out.push(a);
      }
      this.prevLink.set(id, r.link_status);

      // ---- geofence breach (state-change debounced) ----
      // A LOST robot has no fresh position; skip so a frozen last-known fix near
      // the boundary can't flap.
      if (r.link_status !== "LINK_LOST") {
        const inside = this.insideFence(r.telemetry.x, r.telemetry.y);
        const prevInside = this.prevInside.get(id);
        if (prevInside === undefined) {
          // First sighting: a robot ALREADY outside the fence is a live breach —
          // exception-based supervision surfaces it immediately, not just on a
          // transition we happened to witness. (Inside on first sight is nominal.)
          if (!inside) out.push(this.mk("geofence", "critical", id, now, `${id} outside the geofence`));
        } else if (prevInside !== inside) {
          out.push(
            inside
              ? this.mk("geofence", "info", id, now, `${id} re-entered the geofence`)
              : this.mk("geofence", "critical", id, now, `${id} BREACHED the geofence`),
          );
        }
        this.prevInside.set(id, inside);
      }
    }

    // ---- command terminal failures (alert once per command/target) ----
    for (const c of frame.commands) {
      for (const t of c.targets) {
        if (!TERMINAL_FAILURES.includes(t.state)) continue;
        const key = `${c.command_id}:${t.robot_id}`;
        if (this.seenCmdTargets.has(key)) continue;
        this.seenCmdTargets.add(key);
        const label = t.state.replace("CMD_", "");
        out.push(this.mk("command", "warn", t.robot_id, now, `${t.robot_id} command ${label}${t.detail ? ` — ${t.detail}` : ""}`));
      }
    }

    return out;
  }

  private linkAlert(id: string, prev: LinkStatus, cur: LinkStatus, now: number): Alert | null {
    if (cur === "LINK_LIVE" && (prev === "LINK_STALE" || prev === "LINK_LOST")) {
      return this.mk("link", "info", id, now, `${id} link recovered (LIVE)`);
    }
    if (cur === "LINK_STALE") return this.mk("link", "warn", id, now, `${id} link STALE`);
    if (cur === "LINK_LOST") return this.mk("link", "critical", id, now, `${id} link LOST`);
    return null;
  }

  private mk(kind: AlertKind, severity: Severity, robotId: string, ts: number, message: string): Alert {
    return { id: `alert-${this.seq++}`, kind, severity, ts, robotId, message };
  }
}
