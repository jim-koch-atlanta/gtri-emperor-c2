// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
// Unit tests for the pure AlertEngine (run: npm test).

import { describe, it, expect } from "vitest";
import { AlertEngine } from "./alertEngine";
import type { SwarmState, RobotState, LinkStatus, CommandStatus, CommandState } from "./types";

const robot = (id: string, x: number, y: number, link: LinkStatus = "LINK_LIVE"): RobotState => ({
  telemetry: { robot_id: id, seq: 0, x, y, heading: 0, speed: 0, radius: 0 },
  link_status: link,
  age_ms: 0,
});
const frame = (robots: RobotState[], commands: CommandStatus[] = []): SwarmState => ({ seq: 0, robots, commands });
const cmd = (id: string, robotId: string, state: CommandState): CommandStatus => ({
  command_id: id,
  targets: [{ robot_id: robotId, state, detail: "" }],
});

// Fence stub: inside iff x < 100.
const insideIfXlt100 = (x: number) => x < 100;

describe("AlertEngine — link transitions", () => {
  it("emits nothing on first sighting", () => {
    const e = new AlertEngine(insideIfXlt100);
    expect(e.ingest(frame([robot("R-1", 0, 0)]), 0)).toHaveLength(0);
  });

  it("LIVE→STALE warns, →LOST is critical, recovery is info", () => {
    const e = new AlertEngine(insideIfXlt100);
    e.ingest(frame([robot("R-1", 0, 0, "LINK_LIVE")]), 0);
    const stale = e.ingest(frame([robot("R-1", 0, 0, "LINK_STALE")]), 1);
    expect(stale).toMatchObject([{ kind: "link", severity: "warn" }]);
    const lost = e.ingest(frame([robot("R-1", 0, 0, "LINK_LOST")]), 2);
    expect(lost).toMatchObject([{ kind: "link", severity: "critical" }]);
    const back = e.ingest(frame([robot("R-1", 0, 0, "LINK_LIVE")]), 3);
    expect(back).toMatchObject([{ kind: "link", severity: "info" }]);
  });

  it("does not re-alert a steady status", () => {
    const e = new AlertEngine(insideIfXlt100);
    e.ingest(frame([robot("R-1", 0, 0, "LINK_STALE")]), 0);
    e.ingest(frame([robot("R-1", 0, 0, "LINK_STALE")]), 1); // establishes prev
    expect(e.ingest(frame([robot("R-1", 0, 0, "LINK_STALE")]), 2)).toHaveLength(0);
  });
});

describe("AlertEngine — geofence breach", () => {
  it("emits nothing when a robot is inside on first sighting", () => {
    const e = new AlertEngine(insideIfXlt100);
    expect(e.ingest(frame([robot("R-1", 0, 0)]), 0).filter((a) => a.kind === "geofence")).toHaveLength(0);
  });

  it("flags a robot ALREADY outside on first sighting as critical", () => {
    const e = new AlertEngine(insideIfXlt100);
    const res = e.ingest(frame([robot("R-1", 200, 0)]), 0);
    expect(res).toMatchObject([{ kind: "geofence", severity: "critical" }]);
    // ...but does not re-alert while it stays outside.
    expect(e.ingest(frame([robot("R-1", 300, 0)]), 1)).toHaveLength(0);
  });

  it("critical on exit, info on re-entry, debounced while outside", () => {
    const e = new AlertEngine(insideIfXlt100);
    e.ingest(frame([robot("R-1", 0, 0)]), 0); // inside, establishes state
    const out = e.ingest(frame([robot("R-1", 200, 0)]), 1); // exit
    expect(out).toMatchObject([{ kind: "geofence", severity: "critical" }]);
    expect(e.ingest(frame([robot("R-1", 300, 0)]), 2)).toHaveLength(0); // still out → no spam
    const back = e.ingest(frame([robot("R-1", 0, 0)]), 3); // re-entry
    expect(back).toMatchObject([{ kind: "geofence", severity: "info" }]);
  });

  it("skips breach evaluation for a LOST robot", () => {
    const e = new AlertEngine(insideIfXlt100);
    e.ingest(frame([robot("R-1", 0, 0)]), 0); // inside
    // Same robot jumps outside but is LOST: link alert fires, but NO geofence alert.
    const res = e.ingest(frame([robot("R-1", 999, 0, "LINK_LOST")]), 1);
    expect(res.filter((a) => a.kind === "geofence")).toHaveLength(0);
    expect(res.filter((a) => a.kind === "link" && a.severity === "critical")).toHaveLength(1);
  });
});

describe("AlertEngine — command terminal failures", () => {
  it("warns once per (command,target), not per frame", () => {
    const e = new AlertEngine(insideIfXlt100);
    const f = frame([robot("R-1", 0, 0)], [cmd("c1", "R-1", "CMD_ROBOT_OFFLINE")]);
    const first = e.ingest(f, 0);
    expect(first).toMatchObject([{ kind: "command", severity: "warn" }]);
    expect(e.ingest(f, 1)).toHaveLength(0); // same command still present → no duplicate
  });

  it("does not alert on non-terminal command states", () => {
    const e = new AlertEngine(insideIfXlt100);
    const res = e.ingest(frame([robot("R-1", 0, 0)], [cmd("c1", "R-1", "CMD_SENT")]), 0);
    expect(res.filter((a) => a.kind === "command")).toHaveLength(0);
  });
});
