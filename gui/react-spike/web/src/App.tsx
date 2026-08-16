// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Composition root. Holds UI-only state and wires the data seam (useSwarm) to the
// panels. Round 3 adds a central issueCommand() that enforces a confirmation gate
// for wide/destructive commands and records every issue to a client-local audit
// log; plus richer SA toggles (2525 symbols / predicted orbit / coasting ghost).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSwarm } from "./useSwarm";
import { useAlerts } from "./useAlerts";
import { useCommandAudit } from "./useCommandAudit";
import { MapView, type LayerVisibility, type SaVisibility } from "./MapView";
import { Roster } from "./Roster";
import { LayerToggles } from "./LayerToggles";
import { CommandPanel } from "./CommandPanel";
import { CommandStrip } from "./CommandStrip";
import { AlertFeed } from "./AlertFeed";
import { AuditStrip } from "./AuditStrip";
import { ConfirmDialog } from "./ConfirmDialog";
import { StatusBar } from "./StatusBar";
import type { CommandIntent } from "./types";

const CONFIRM_ABOVE = 3; // any command targeting more than this many robots confirms

interface ConfirmSpec {
  title: string;
  lines: string[];
  danger: boolean;
  confirmLabel: string;
  onConfirm: () => void;
}

function paramsSummary(p: CommandIntent["params"]): string {
  const parts: string[] = [];
  if (typeof p.speed === "number") parts.push(`speed → ${p.speed}`);
  if (typeof p.radius === "number") parts.push(`radius → ${p.radius}`);
  if (typeof p.center_x === "number" || typeof p.center_y === "number") parts.push("center →");
  if (typeof p.theta === "number") parts.push(`θ → ${p.theta}`);
  return parts.join(" · ") || "no change";
}

export default function App() {
  const { frame, status, trailsRef, sendCommand } = useSwarm();
  const { alerts, acked, ack, ackAll, unackedCount, criticalRobots, breachPulseNonce } = useAlerts(frame);
  const audit = useCommandAudit(frame);
  const robots = frame?.robots ?? [];
  const commands = frame?.commands ?? [];
  const allIds = useMemo(() => robots.map((r) => r.telemetry.robot_id), [robots]);

  // Screenshot/demo helper (THROWAWAY): drive one-shot UI states from the URL —
  //   ?sel=R-03,R-05   pre-select   ?sym=1   2525 on
  //   ?confirm=allstop opens the confirm dialog   ?fire=allstop issues it
  const demo = useMemo(() => new URLSearchParams(window.location.search), []);
  const demoFiredRef = useRef(false);

  const [selected, setSelected] = useState<Set<string>>(() => new Set((demo.get("sel") ?? "").split(",").filter(Boolean)));
  const [basemap, setBasemap] = useState<"osm" | "dark">("dark");
  const [fitNonce, setFitNonce] = useState(0);
  const [flyTo, setFlyTo] = useState<{ robotId: string; nonce: number } | null>(null);
  const [layerVis, setLayerVis] = useState<LayerVisibility>({ mission: true, buffers: true, inputs: true });
  const [saVis, setSaVis] = useState<SaVisibility>({ symbols: demo.get("sym") === "1", orbit: true, ghost: true });
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);

  const toggleLayer = useCallback((k: keyof LayerVisibility) => setLayerVis((v) => ({ ...v, [k]: !v[k] })), []);
  const toggleSa = useCallback((k: keyof SaVisibility) => setSaVis((v) => ({ ...v, [k]: !v[k] })), []);

  // --- the one command path: send + record to the audit log ---------------
  const doSend = useCallback(
    (intent: CommandIntent, allStop: boolean) => {
      const id = sendCommand(intent);
      audit.record(id, intent, allStop);
    },
    [sendCommand, audit],
  );

  // Gate wide/destructive commands behind a scope-stating confirmation.
  const issueCommand = useCallback(
    (intent: CommandIntent, opts: { allStop?: boolean } = {}) => {
      const allStop = opts.allStop ?? false;
      const n = intent.targets.length;
      if (n === 0) return;
      if (allStop || n > CONFIRM_ABOVE) {
        setConfirm({
          title: allStop ? `Stop ALL ${n} robots?` : `Apply to ${n} robots?`,
          lines: [`Targets: ${intent.targets.join(", ")}`, `Command: ${allStop ? "speed → 0 (STOP)" : paramsSummary(intent.params)}`],
          danger: allStop,
          confirmLabel: allStop ? "STOP ALL" : `Apply to ${n}`,
          onConfirm: () => {
            doSend(intent, allStop);
            setConfirm(null);
          },
        });
      } else {
        doSend(intent, allStop);
      }
    },
    [doSend],
  );

  const onAllStop = useCallback(() => {
    if (allIds.length === 0) return;
    issueCommand({ targets: allIds, params: { speed: 0 } }, { allStop: true });
  }, [allIds, issueCommand]);

  // one-shot demo trigger (see demo params above)
  useEffect(() => {
    if (demoFiredRef.current || allIds.length === 0) return;
    if (demo.get("confirm") === "allstop") { demoFiredRef.current = true; onAllStop(); }
    else if (demo.get("fire") === "allstop") { demoFiredRef.current = true; doSend({ targets: allIds, params: { speed: 0 } }, true); }
  }, [allIds, demo, onAllStop, doSend]);

  const handleSelect = useCallback((id: string, additive: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (additive) {
        next.has(id) ? next.delete(id) : next.add(id);
      } else {
        next.clear();
        next.add(id);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelected(new Set()), []);

  const flyToRobot = useCallback((robotId: string) => {
    setSelected(new Set([robotId]));
    setFlyTo((f) => ({ robotId, nonce: (f?.nonce ?? 0) + 1 }));
  }, []);

  return (
    <div className="app">
      <StatusBar
        robots={robots}
        status={status}
        basemap={basemap}
        unackedCount={unackedCount}
        symbology={saVis.symbols}
        onToggleSymbology={() => toggleSa("symbols")}
        onAllStop={onAllStop}
        onToggleBasemap={() => setBasemap((b) => (b === "osm" ? "dark" : "osm"))}
        onFitAll={() => setFitNonce((n) => n + 1)}
      />
      <div className="body">
        <div className="leftcol">
          <Roster robots={robots} selected={selected} onSelect={handleSelect} />
          <LayerToggles vis={layerVis} onToggle={toggleLayer} saVis={saVis} onToggleSa={toggleSa} />
        </div>
        <MapView
          frame={frame}
          trailsRef={trailsRef}
          selected={selected}
          basemap={basemap}
          fitNonce={fitNonce}
          layerVis={layerVis}
          saVis={saVis}
          criticalRobots={criticalRobots}
          breachPulseNonce={breachPulseNonce}
          flyTo={flyTo}
          onSelect={handleSelect}
          onClearSelection={clearSelection}
        />
        <div className="rightcol">
          <CommandPanel selected={selected} robots={robots} onApply={issueCommand} />
          <AlertFeed
            alerts={alerts}
            acked={acked}
            unackedCount={unackedCount}
            onAck={ack}
            onAckAll={ackAll}
            onSelectAlert={flyToRobot}
          />
          <AuditStrip log={audit.log} />
        </div>
      </div>
      <CommandStrip commands={commands} />
      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          lines={confirm.lines}
          danger={confirm.danger}
          confirmLabel={confirm.confirmLabel}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
