// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Command status strip. This is the difference between a dashboard and a C2
// system (TECH_SPEC §5): every issued command shows its live lifecycle PER
// TARGET, so the operator always knows whether it worked — PENDING→SENT→APPLIED,
// or REJECTED / EXPIRED / ROBOT_OFFLINE. Driven straight off the authoritative
// SwarmState.commands the server assembles; the UI invents no state.

import type { CommandStatus } from "./types";
import { CMD_COLOR, shortCmd } from "./viz";

interface Props {
  commands: CommandStatus[];
}

export function CommandStrip({ commands }: Props) {
  // Newest last from the server; show newest first here.
  const rows = [...commands].reverse();
  return (
    <div className="strip">
      <div className="panel-title">COMMANDS</div>
      {rows.length === 0 && <span className="muted">no commands issued yet</span>}
      <div className="strip-rows">
        {rows.map((c) => (
          <div key={c.command_id} className="strip-row">
            <span className="cmd-id">{c.command_id}</span>
            <span className="cmd-targets">
              {c.targets.map((t) => (
                <span key={t.robot_id} className="chip" style={{ borderColor: CMD_COLOR[t.state], color: CMD_COLOR[t.state] }}>
                  {t.robot_id}: {shortCmd(t.state)}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
