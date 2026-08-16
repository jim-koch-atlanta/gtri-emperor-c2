// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Roster panel. The operator must never have to *notice a missing dot* — every
// robot is listed here with its link status, so a STALE/LOST asset is loud even
// when its dot is frozen or gone (TECH_SPEC §3). Selection here stays in sync
// with the map (both drive App's one selection set).

import type { RobotState } from "./types";
import { STATUS_COLOR, shortStatus } from "./viz";

interface Props {
  robots: RobotState[];
  selected: Set<string>;
  onSelect: (id: string, additive: boolean) => void;
}

function fmtAge(ms: number): string {
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function Roster({ robots, selected, onSelect }: Props) {
  const sorted = [...robots].sort((a, b) => a.telemetry.robot_id.localeCompare(b.telemetry.robot_id));
  return (
    <div className="panel roster">
      <div className="panel-title">ROSTER</div>
      <div className="roster-list">
        {sorted.length === 0 && <div className="muted">no robots yet…</div>}
        {sorted.map((r) => {
          const id = r.telemetry.robot_id;
          const isSel = selected.has(id);
          return (
            <div
              key={id}
              className={`roster-row${isSel ? " selected" : ""}`}
              onClick={(e) => onSelect(id, e.ctrlKey || e.metaKey || e.shiftKey)}
            >
              <span className="dot" style={{ background: STATUS_COLOR[r.link_status] }} />
              <span className="rid">{id}</span>
              <span className="rstatus" style={{ color: STATUS_COLOR[r.link_status] }}>
                {shortStatus(r.link_status)}
              </span>
              <span className="rage">{fmtAge(r.age_ms)}</span>
              <span className="rparams">
                {r.telemetry.speed.toFixed(0)} m/s · R{r.telemetry.radius.toFixed(0)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
