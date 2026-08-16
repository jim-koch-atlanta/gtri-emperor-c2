// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Client-local audit log of every command issued THIS SESSION: timestamp, scope
// (targets), params, and the live per-target outcome pulled from the authoritative
// SwarmState.commands. Once a command ages out of the server's retention window it
// leaves SwarmState.commands, so we FREEZE its last-known outcome here (a log must
// not forget). Correlation is by the client-minted command_id (see useSwarm).
//
// IMPORTANT (and noted in the UI + report): this is a CLIENT-LOCAL log — it lives
// in this browser tab and dies on refresh. Real audit is server-authored:
// persisted, attributed to an operator identity, tamper-evident, replayable.

import { useCallback, useEffect, useState } from "react";
import type { SwarmState, CommandIntent, CommandState } from "./types";

export interface AuditEntry {
  command_id: string;
  ts: number; // client wall-clock at issue
  targets: string[];
  params: CommandIntent["params"];
  allStop: boolean;
  outcomes: Record<string, CommandState>; // robot_id -> latest known state
}

const MAX_ENTRIES = 100;

function sameOutcomes(a: Record<string, CommandState>, b: Record<string, CommandState>): boolean {
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  return ak.every((k) => a[k] === b[k]);
}

export function useCommandAudit(frame: SwarmState | null) {
  const [entries, setEntries] = useState<AuditEntry[]>([]);

  const record = useCallback((command_id: string, intent: CommandIntent, allStop = false) => {
    const outcomes: Record<string, CommandState> = {};
    for (const t of intent.targets) outcomes[t] = "CMD_PENDING";
    setEntries((prev) =>
      [{ command_id, ts: Date.now(), targets: intent.targets, params: intent.params, allStop, outcomes }, ...prev].slice(0, MAX_ENTRIES),
    );
  }, []);

  // Merge live per-target outcomes from the authoritative frame; freeze on retire.
  useEffect(() => {
    if (!frame) return;
    const byId = new Map(frame.commands.map((c) => [c.command_id, c]));
    setEntries((prev) => {
      let changed = false;
      const next = prev.map((e) => {
        const cmd = byId.get(e.command_id);
        if (!cmd) return e; // retired from the server — keep the last-known outcome
        const outcomes: Record<string, CommandState> = { ...e.outcomes };
        for (const t of cmd.targets) outcomes[t.robot_id] = t.state;
        if (sameOutcomes(e.outcomes, outcomes)) return e;
        changed = true;
        return { ...e, outcomes };
      });
      return changed ? next : prev;
    });
  }, [frame]);

  return { log: entries, count: entries.length, record };
}
