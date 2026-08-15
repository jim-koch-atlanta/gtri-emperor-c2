// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// FakeSource — a self-contained swarm simulator so the web client (and the whole
// bridge) is demoable with NO C++ server running. It emits the same SwarmState
// shape GrpcSource does, using the same planar E/N-meters convention as the real
// robot_sim (TECH_SPEC §2 circular motion), and it walks a submitted command
// through PENDING -> SENT -> APPLIED (§5) while actually mutating the target's R/V
// so the circle visibly changes. This is a stand-in ONLY — it is not the C2 core,
// it has no watchdog, and its command machine is a hand-wave of the real tracker.

import type { Source } from "./source.js";
import type {
  SwarmState,
  RobotState,
  CommandStatus,
  CommandState,
  CommandIntent,
  Accepted,
} from "./types.js";

const DT = 0.2; // 5 Hz, matching the server's SwarmState cadence
const RETAIN_TICKS = 40; // keep a finished command visible ~8s (retention window)

interface FakeRobot {
  id: string;
  cx: number;
  cy: number;
  R: number;
  V: number;
  theta0: number;
  frozen: boolean; // stands in for a STALE link — position stops updating
}

interface TargetProgress {
  robot_id: string;
  state: CommandState;
  detail: string;
  ticksToNext: number; // ticks until the next lifecycle transition
  pending?: CommandIntent["params"]; // params to apply on reaching APPLIED
}

interface FakeCommand {
  command_id: string;
  targets: TargetProgress[];
  retire: number; // ticks-remaining before this command drops off the strip
}

export class FakeSource implements Source {
  readonly kind = "fake" as const;
  private robots: FakeRobot[];
  private elapsed = 0;
  private seq = 0;
  private timer: NodeJS.Timeout | null = null;
  private commands: FakeCommand[] = [];
  private frameCb: (s: SwarmState) => void = () => {};
  private statusCb: (connected: boolean, detail: string) => void = () => {};
  private commandSeq = 0;

  constructor() {
    // 5 live orbiters + 1 frozen (STALE) robot, positioned to sit INSIDE the
    // mission fence fixture (fixtures/mcmurdo_mission.txt): launch circle, ingress
    // corridor, and ROI buffer, all in local E/N metres from the McMurdo anchor.
    // R-03 orbits inside the ROI and is the geofence-breach demo robot — bump its
    // radius large and its orbit clears the whole fence (see MORNING_REPORT beat).
    this.robots = [
      { id: "R-01", cx: 0, cy: 0, R: 80, V: 14, theta0: 0.0, frozen: false }, // launch
      { id: "R-02", cx: 300, cy: 250, R: 60, V: 11, theta0: 1.1, frozen: false }, // corridor
      { id: "R-03", cx: 700, cy: 600, R: 95, V: 16, theta0: 2.2, frozen: false }, // ROI (breach demo)
      { id: "R-04", cx: 500, cy: 420, R: 70, V: 12, theta0: 3.3, frozen: false }, // corridor→ROI
      { id: "R-05", cx: 760, cy: 560, R: 65, V: 9, theta0: 4.4, frozen: false }, // ROI
      { id: "R-06", cx: 140, cy: 90, R: 70, V: 13, theta0: 5.5, frozen: true }, // launch (STALE)
    ];
  }

  onFrame(cb: (s: SwarmState) => void) {
    this.frameCb = cb;
  }
  onStatus(cb: (connected: boolean, detail: string) => void) {
    this.statusCb = cb;
  }

  start() {
    this.statusCb(true, "fake simulator running (no C2 server needed)");
    this.timer = setInterval(() => this.tick(), DT * 1000);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private robotById(id: string): FakeRobot | undefined {
    return this.robots.find((r) => r.id === id);
  }

  private tick() {
    this.elapsed += DT;
    this.advanceCommands();

    const robots: RobotState[] = this.robots.map((r) => {
      // A frozen (STALE) robot holds its last-known position — the link is dead,
      // so no new telemetry advances it. Live robots orbit off elapsed time.
      const phi = r.frozen ? r.theta0 : (r.V / r.R) * this.elapsed + r.theta0;
      const x = r.cx + r.R * Math.cos(phi);
      const y = r.cy + r.R * Math.sin(phi);
      return {
        telemetry: {
          robot_id: r.id,
          seq: this.seq,
          x,
          y,
          heading: phi + Math.PI / 2,
          speed: r.V,
          radius: r.R,
        },
        link_status: r.frozen ? "LINK_STALE" : "LINK_LIVE",
        // Frozen robot's age climbs; live robots get a small jittery-but-fixed age.
        age_ms: r.frozen ? Math.round(2000 + this.elapsed * 1000) : 60,
      };
    });

    const commands: CommandStatus[] = this.commands.map((c) => ({
      command_id: c.command_id,
      targets: c.targets.map((t) => ({
        robot_id: t.robot_id,
        state: t.state,
        detail: t.detail,
      })),
    }));

    this.frameCb({ seq: this.seq++, robots, commands });
  }

  // Drive each command's per-target lifecycle one tick, apply params at APPLIED,
  // and retire commands after the retention window.
  private advanceCommands() {
    for (const c of this.commands) {
      for (const t of c.targets) {
        if (t.state === "CMD_PENDING" || t.state === "CMD_SENT") {
          t.ticksToNext -= 1;
          if (t.ticksToNext <= 0) {
            if (t.state === "CMD_PENDING") {
              t.state = "CMD_SENT";
              t.ticksToNext = 2;
            } else {
              t.state = "CMD_APPLIED";
              this.applyParams(t.robot_id, t.pending ?? {});
            }
          }
        }
      }
      const settled = c.targets.every(
        (t) => t.state !== "CMD_PENDING" && t.state !== "CMD_SENT",
      );
      if (settled) c.retire -= 1;
    }
    this.commands = this.commands.filter((c) => c.retire > 0);
  }

  // Apply R/V (and optionally center/theta) while keeping the phase continuous —
  // only the radial teleport shows. (The real robot_sim also teleports phase; the
  // fake smooths it purely for demo legibility. Noted in the report.)
  private applyParams(id: string, params: CommandIntent["params"]) {
    const r = this.robotById(id);
    if (!r) return;
    const phiOld = (r.V / r.R) * this.elapsed + r.theta0;
    if (typeof params.center_x === "number") r.cx = params.center_x;
    if (typeof params.center_y === "number") r.cy = params.center_y;
    if (typeof params.radius === "number" && params.radius > 0) r.R = params.radius;
    if (typeof params.speed === "number") r.V = params.speed;
    if (typeof params.theta === "number") {
      r.theta0 = params.theta;
    } else {
      // Preserve current angle across the R/V change: phi_new(elapsed) == phiOld.
      r.theta0 = phiOld - (r.V / r.R) * this.elapsed;
    }
  }

  sendCommand(intent: CommandIntent): Promise<Accepted> {
    const command_id = `fake-${this.commandSeq++}`;
    const targets: TargetProgress[] = intent.targets.map((robot_id) => {
      const r = this.robotById(robot_id);
      if (!r) {
        return { robot_id, state: "CMD_ROBOT_OFFLINE", detail: "unknown robot", ticksToNext: 0 };
      }
      if (r.frozen) {
        // Offline at dispatch time -> surfaced immediately, no send (§5).
        return { robot_id, state: "CMD_ROBOT_OFFLINE", detail: "link lost", ticksToNext: 0 };
      }
      return { robot_id, state: "CMD_PENDING", detail: "", ticksToNext: 1, pending: intent.params };
    });
    this.commands.push({ command_id, targets, retire: RETAIN_TICKS });
    return Promise.resolve({ command_id, accepted: true, detail: "fake" });
  }
}
