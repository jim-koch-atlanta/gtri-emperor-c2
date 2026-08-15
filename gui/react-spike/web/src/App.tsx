// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Composition root. Holds the three bits of UI-only state (selection set, basemap
// choice, a fit-nonce) and wires the one data seam (useSwarm) to the panels. The
// whole app is a pure function of the SwarmState frames arriving from the bridge.

import { useCallback, useState } from "react";
import { useSwarm } from "./useSwarm";
import { MapView } from "./MapView";
import { Roster } from "./Roster";
import { CommandPanel } from "./CommandPanel";
import { CommandStrip } from "./CommandStrip";
import { StatusBar } from "./StatusBar";

export default function App() {
  const { frame, status, trailsRef, sendCommand } = useSwarm();
  const robots = frame?.robots ?? [];
  const commands = frame?.commands ?? [];

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [basemap, setBasemap] = useState<"osm" | "dark">("osm");
  const [fitNonce, setFitNonce] = useState(0);

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

  return (
    <div className="app">
      <StatusBar
        robots={robots}
        status={status}
        basemap={basemap}
        onToggleBasemap={() => setBasemap((b) => (b === "osm" ? "dark" : "osm"))}
        onFitAll={() => setFitNonce((n) => n + 1)}
      />
      <div className="body">
        <Roster robots={robots} selected={selected} onSelect={handleSelect} />
        <MapView
          frame={frame}
          trailsRef={trailsRef}
          selected={selected}
          basemap={basemap}
          fitNonce={fitNonce}
          onSelect={handleSelect}
          onClearSelection={clearSelection}
        />
        <CommandPanel selected={selected} robots={robots} onApply={sendCommand} />
      </div>
      <CommandStrip commands={commands} />
    </div>
  );
}
