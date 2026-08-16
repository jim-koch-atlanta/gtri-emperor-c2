// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// React glue around the pure AlertEngine: run it on each SwarmState frame,
// accumulate alerts, track ACKs, and derive what the map needs (which robots are
// flashing, when to pulse the fence).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SwarmState } from "./types";
import { AlertEngine, type Alert } from "./alertEngine";
import { insideFenceMeters } from "./mission";

const MAX_ALERTS = 200;

export function useAlerts(frame: SwarmState | null) {
  const engineRef = useRef<AlertEngine>();
  if (!engineRef.current) engineRef.current = new AlertEngine(insideFenceMeters);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [acked, setAcked] = useState<Set<string>>(new Set());
  const [breachPulseNonce, setBreachPulseNonce] = useState(0);

  useEffect(() => {
    if (!frame) return;
    const created = engineRef.current!.ingest(frame, Date.now());
    if (created.length === 0) return;
    setAlerts((prev) => [...prev, ...created].slice(-MAX_ALERTS));
    if (created.some((a) => a.kind === "geofence" && a.severity === "critical")) {
      setBreachPulseNonce((n) => n + 1);
    }
  }, [frame]);

  const ack = useCallback((id: string) => setAcked((prev) => new Set(prev).add(id)), []);
  const ackAll = useCallback(() => setAcked(new Set(alerts.map((a) => a.id))), [alerts]);

  const unacked = useMemo(() => alerts.filter((a) => !acked.has(a.id)), [alerts, acked]);
  // Robots with an unacked CRITICAL alert flash on the map until acknowledged.
  const criticalRobots = useMemo(
    () => new Set(unacked.filter((a) => a.severity === "critical").map((a) => a.robotId)),
    [unacked],
  );

  return { alerts, acked, ack, ackAll, unackedCount: unacked.length, criticalRobots, breachPulseNonce };
}
