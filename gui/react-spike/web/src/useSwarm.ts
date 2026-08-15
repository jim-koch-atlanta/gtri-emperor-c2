// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// The single data seam for the whole UI: opens a WebSocket to the bridge, keeps
// the latest SwarmState frame, accumulates per-robot trails, and exposes
// sendCommand. Everything else in the app is a pure function of what this returns.

import { useCallback, useEffect, useRef, useState } from "react";
import type { SwarmState, CommandIntent, ServerMessage } from "./types";

const BRIDGE_URL = "ws://localhost:8081";
const TRAIL_LEN = 50;
const RECONNECT_MS = 1000;

export interface SwarmStatus {
  ws: boolean; // is the browser<->bridge WebSocket open?
  source: "grpc" | "fake" | "?"; // what the bridge is fronting
  connected: boolean; // is the bridge<->C2 link healthy?
  detail: string;
}

// Per-robot world-coordinate history, kept in a ref so 5 Hz frames don't thrash
// React state; MapView reads it imperatively when it redraws.
export type Trails = Map<string, Array<[number, number]>>;

export function useSwarm() {
  const [frame, setFrame] = useState<SwarmState | null>(null);
  const [status, setStatus] = useState<SwarmStatus>({
    ws: false,
    source: "?",
    connected: false,
    detail: "connecting to bridge…",
  });
  const trailsRef = useRef<Trails>(new Map());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let closed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const ws = new WebSocket(BRIDGE_URL);
      wsRef.current = ws;

      ws.onopen = () =>
        setStatus((s) => ({ ...s, ws: true, detail: "bridge connected" }));

      ws.onmessage = (ev) => {
        const msg: ServerMessage = JSON.parse(ev.data);
        if (msg.type === "swarm") {
          pushTrails(trailsRef.current, msg.state);
          setFrame(msg.state);
        } else if (msg.type === "status") {
          setStatus((s) => ({
            ...s,
            source: msg.source,
            connected: msg.connected,
            detail: msg.detail,
          }));
        }
        // "ack" is currently informational; the status strip is driven by the
        // authoritative per-target states inside SwarmState.commands instead.
      };

      ws.onclose = () => {
        setStatus((s) => ({ ...s, ws: false, connected: false, detail: "bridge disconnected" }));
        if (!closed) retry = setTimeout(connect, RECONNECT_MS);
      };

      ws.onerror = () => ws.close();
    };

    connect();
    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      wsRef.current?.close();
    };
  }, []);

  const sendCommand = useCallback((intent: CommandIntent) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "command", intent }));
    }
  }, []);

  return { frame, status, trailsRef, sendCommand };
}

function pushTrails(trails: Trails, state: SwarmState) {
  for (const r of state.robots) {
    // Only trail robots that are actually reporting position (LIVE). A stale
    // robot's trail freezes where it was — matching its frozen dot.
    if (r.link_status === "LINK_LOST") continue;
    const id = r.telemetry.robot_id;
    let hist = trails.get(id);
    if (!hist) {
      hist = [];
      trails.set(id, hist);
    }
    hist.push([r.telemetry.x, r.telemetry.y]);
    if (hist.length > TRAIL_LEN) hist.shift();
  }
}
