// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Alert feed (right panel). Newest first, colored by severity, each acknowledgeable.
// Clicking an alert selects and flies to the robot — the operator jumps straight
// from "what's wrong" to "where". This is the operator-facing half of supervision
// by exception (§9): the map shows everything, the feed says what needs attention.

import type { Alert } from "./alertEngine";
import { SEVERITY_COLOR } from "./viz";

interface Props {
  alerts: Alert[];
  acked: Set<string>;
  unackedCount: number;
  onAck: (id: string) => void;
  onAckAll: () => void;
  onSelectAlert: (robotId: string) => void;
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

export function AlertFeed({ alerts, acked, unackedCount, onAck, onAckAll, onSelectAlert }: Props) {
  const rows = [...alerts].reverse();
  return (
    <div className="panel alerts">
      <div className="alerts-head">
        <span className="alerts-title">ALERTS</span>
        {unackedCount > 0 && <span className="alert-badge">{unackedCount}</span>}
        <button className="ghost ackall" onClick={onAckAll} disabled={unackedCount === 0}>
          ACK ALL
        </button>
      </div>
      <div className="alert-list">
        {rows.length === 0 && <div className="muted alert-empty">no alerts — swarm nominal</div>}
        {rows.map((a) => {
          const isAck = acked.has(a.id);
          return (
            <div
              key={a.id}
              className={`alert-row sev-${a.severity}${isAck ? " acked" : ""}`}
              onClick={() => onSelectAlert(a.robotId)}
              title="click to select + fly to robot"
            >
              <span className="alert-bar" style={{ background: SEVERITY_COLOR[a.severity] }} />
              <div className="alert-body">
                <div className="alert-msg">{a.message}</div>
                <div className="alert-meta">
                  {fmtTime(a.ts)} · {a.severity.toUpperCase()}
                </div>
              </div>
              {!isAck && (
                <button
                  className="ack-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAck(a.id);
                  }}
                >
                  ACK
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
