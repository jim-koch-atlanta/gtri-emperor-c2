// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Composition root. Holds the three bits of UI-only state (selection set, basemap
// choice, a fit-nonce) and wires the one data seam (useSwarm) to the panels. The
// whole app is a pure function of the SwarmState frames arriving from the bridge.

import { useCallback, useState } from "react";
import { useSwarm } from "./useSwarm";
import { useAlerts } from "./useAlerts";
import { MapView, type LayerVisibility } from "./MapView";
import { Roster } from "./Roster";
import { LayerToggles } from "./LayerToggles";
import { CommandPanel } from "./CommandPanel";
import { CommandStrip } from "./CommandStrip";
import { AlertFeed } from "./AlertFeed";
import { StatusBar } from "./StatusBar";

export default function App() {
  const { frame, status, trailsRef, sendCommand } = useSwarm();
  const { alerts, acked, ack, ackAll, unackedCount, criticalRobots, breachPulseNonce } = useAlerts(frame);
  const robots = frame?.robots ?? [];
  const commands = frame?.commands ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [basemap, setBasemap] = useState<"osm" | "dark">("dark");
  const [fitNonce, setFitNonce] = useState(0);
  const [flyTo, setFlyTo] = useState<{ robotId: string; nonce: number } | null>(null);
  const [layerVis, setLayerVis] = useState<LayerVisibility>({ mission: true, buffers: true, inputs: true });
  const toggleLayer = useCallback((k: keyof LayerVisibility) => setLayerVis((v) => ({ ...v, [k]: !v[k] })), []);

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

  // Alert click: select the robot AND fly the map to it.
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
        onToggleBasemap={() => setBasemap((b) => (b === "osm" ? "dark" : "osm"))}
        onFitAll={() => setFitNonce((n) => n + 1)}
      />
      <div className="body">
        <div className="leftcol">
          <Roster robots={robots} selected={selected} onSelect={handleSelect} />
          <LayerToggles vis={layerVis} onToggle={toggleLayer} />
        </div>
        <MapView
          frame={frame}
          trailsRef={trailsRef}
          selected={selected}
          basemap={basemap}
          fitNonce={fitNonce}
          layerVis={layerVis}
          criticalRobots={criticalRobots}
          breachPulseNonce={breachPulseNonce}
          flyTo={flyTo}
          onSelect={handleSelect}
          onClearSelection={clearSelection}
        />
        <div className="rightcol">
          <CommandPanel selected={selected} robots={robots} onApply={sendCommand} />
          <AlertFeed
            alerts={alerts}
            acked={acked}
            unackedCount={unackedCount}
            onAck={ack}
            onAckAll={ackAll}
            onSelectAlert={flyToRobot}
          />
        </div>
      </div>
      <CommandStrip commands={commands} />
    </div>
  );
}
