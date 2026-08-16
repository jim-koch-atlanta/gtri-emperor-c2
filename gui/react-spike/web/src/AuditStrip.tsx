// THROWAWAY AI-GENERATED EXPLORATION (round 3) — proves the API seam; not the submission.
//
// Audit log panel (collapsible, right column). Every command issued this session:
// time · scope · params · per-target outcome chips. Labeled CLIENT-LOCAL — the
// point of showing it is command *accountability* (who did what, did it land);
// production keeps the authoritative, persisted, operator-attributed audit on the
// C2 server (noted in the report's "what production differs").

import { useState } from "react";
import type { AuditEntry } from "./useCommandAudit";
import { CMD_COLOR, shortCmd } from "./viz";

interface Props {
  log: AuditEntry[];
}

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour12: false });

function paramsSummary(p: AuditEntry["params"]): string {
  const parts: string[] = [];
  if (typeof p.speed === "number") parts.push(`speed ${p.speed}`);
  if (typeof p.radius === "number") parts.push(`radius ${p.radius}`);
  if (typeof p.center_x === "number" || typeof p.center_y === "number") parts.push(`center (${p.center_x ?? "—"},${p.center_y ?? "—"})`);
  if (typeof p.theta === "number") parts.push(`θ ${p.theta}`);
  return parts.join(" · ") || "—";
}

function scopeLabel(e: AuditEntry): string {
  if (e.allStop) return `ALL ${e.targets.length}`;
  if (e.targets.length === 1) return e.targets[0];
  if (e.targets.length <= 3) return e.targets.join(",");
  return `${e.targets.length} robots`;
}

export function AuditStrip({ log }: Props) {
  const [open, setOpen] = useState(true);
  return (
    <div className={`panel audit${open ? " open" : ""}`}>
      <button className="audit-head" onClick={() => setOpen((o) => !o)}>
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="audit-title">AUDIT LOG</span>
        <span className="audit-count">{log.length}</span>
        <span className="audit-note">client-local</span>
      </button>
      {open && (
        <div className="audit-list">
          {log.length === 0 && <div className="muted audit-empty">no commands issued this session</div>}
          {log.map((e) => (
            <div key={e.command_id} className={`audit-row${e.allStop ? " allstop" : ""}`}>
              <div className="audit-line1">
                <span className="audit-time">{fmtTime(e.ts)}</span>
                <span className={`audit-scope${e.allStop ? " danger" : ""}`}>{scopeLabel(e)}</span>
                <span className="audit-params">{paramsSummary(e.params)}</span>
              </div>
              <div className="audit-chips">
                {e.targets.map((id) => {
                  const st = e.outcomes[id] ?? "CMD_STATE_UNSPECIFIED";
                  return (
                    <span key={id} className="audit-chip" style={{ borderColor: CMD_COLOR[st], color: CMD_COLOR[st] }}>
                      {id}: {shortCmd(st)}
                    </span>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
