// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Command panel. Shows the selected robot's CURRENT speed/radius as the starting
// point, lets the operator edit + APPLY, and states its scope explicitly on the
// button ("APPLY TO 3 ROBOTS"). Only the fields the operator actually fills are
// sent, so proto3 field presence stays honest (a blank field is "don't touch").

import { useEffect, useState } from "react";
import type { RobotState, CommandIntent } from "./types";

interface Props {
  selected: Set<string>;
  robots: RobotState[];
  onApply: (intent: CommandIntent) => void;
}

export function CommandPanel({ selected, robots, onApply }: Props) {
  const targets = [...selected];
  const primary = robots.find((r) => r.telemetry.robot_id === targets[0]);

  const [speed, setSpeed] = useState("");
  const [radius, setRadius] = useState("");

  // Prefill from the primary (first-selected) robot whenever the selection
  // changes, so edits start from truth rather than a blank slate.
  useEffect(() => {
    if (primary) {
      setSpeed(primary.telemetry.speed.toFixed(0));
      setRadius(primary.telemetry.radius.toFixed(0));
    } else {
      setSpeed("");
      setRadius("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets[0]]);

  const n = targets.length;
  const disabled = n === 0;

  const apply = () => {
    if (disabled) return;
    const params: CommandIntent["params"] = {};
    if (speed.trim() !== "" && Number.isFinite(Number(speed))) params.speed = Number(speed);
    if (radius.trim() !== "" && Number.isFinite(Number(radius))) params.radius = Number(radius);
    if (Object.keys(params).length === 0) return;
    onApply({ targets, params });
  };

  return (
    <div className="panel command">
      <div className="panel-title">COMMAND</div>
      {disabled ? (
        <div className="muted">select a robot on the map or roster</div>
      ) : (
        <div className="sel-summary">
          {n === 1 ? `SELECTED: ${targets[0]}` : `SELECTED: ${n} robots`}
          {n > 1 && <div className="muted small">{targets.join(", ")}</div>}
        </div>
      )}

      <label className="field">
        <span>Speed (m/s)</span>
        <input value={speed} onChange={(e) => setSpeed(e.target.value)} disabled={disabled} inputMode="decimal" />
      </label>
      <label className="field">
        <span>Radius (m)</span>
        <input value={radius} onChange={(e) => setRadius(e.target.value)} disabled={disabled} inputMode="decimal" />
      </label>

      <button className="apply" onClick={apply} disabled={disabled}>
        {disabled ? "APPLY" : `APPLY TO ${n} ROBOT${n === 1 ? "" : "S"}`}
      </button>
    </div>
  );
}
