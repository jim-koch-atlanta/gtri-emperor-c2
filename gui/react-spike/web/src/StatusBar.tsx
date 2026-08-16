// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Top status bar. Glanceable swarm health (LIVE/STALE/LOST counts) plus the
// connection state (which client seam you're looking at). Round 3 adds an
// unmissable red ALL-STOP (command authority) and a 2525 symbology toggle.

import type { RobotState } from "./types";
import type { SwarmStatus } from "./useSwarm";
import { STATUS_COLOR } from "./viz";

interface Props {
  robots: RobotState[];
  status: SwarmStatus;
  basemap: "osm" | "dark";
  unackedCount: number;
  symbology: boolean;
  onAllStop: () => void;
  onToggleSymbology: () => void;
  onToggleBasemap: () => void;
  onFitAll: () => void;
}

export function StatusBar({ robots, status, basemap, unackedCount, symbology, onAllStop, onToggleSymbology, onToggleBasemap, onFitAll }: Props) {
  const live = robots.filter((r) => r.link_status === "LINK_LIVE").length;
  const stale = robots.filter((r) => r.link_status === "LINK_STALE").length;
  const lost = robots.filter((r) => r.link_status === "LINK_LOST").length;

  const linkOk = status.ws && status.connected;
  const linkText = !status.ws
    ? "BRIDGE DOWN"
    : status.connected
      ? `LIVE · ${status.source.toUpperCase()}`
      : `NO C2 · ${status.source.toUpperCase()}`;

  return (
    <div className="statusbar">
      <div className="brand">SWARM&nbsp;C2 <span className="brand-sub">react/maplibre spike</span></div>
      <button className="allstop" onClick={onAllStop} disabled={robots.length === 0} title="Stop all robots (speed → 0)">
        ⬛ ALL-STOP
      </button>
      <div className="counts">
        <span style={{ color: STATUS_COLOR.LINK_LIVE }}>{live} LIVE</span>
        <span style={{ color: STATUS_COLOR.LINK_STALE }}>{stale} STALE</span>
        <span style={{ color: STATUS_COLOR.LINK_LOST }}>{lost} LOST</span>
      </div>
      {unackedCount > 0 && (
        <div className="alarm" title={`${unackedCount} unacknowledged alert(s)`}>
          <span className="alarm-badge">{unackedCount}</span> ALERTS
        </div>
      )}
      <div className="right">
        <button className={`ghost${symbology ? " on" : ""}`} onClick={onToggleSymbology} title="MIL-STD-2525 symbols">2525</button>
        <button className="ghost" onClick={onFitAll}>Fit All</button>
        <button className="ghost" onClick={onToggleBasemap}>Basemap: {basemap === "osm" ? "OSM" : "Dark"}</button>
        <span className={`conn ${linkOk ? "ok" : "bad"}`} title={status.detail}>
          <span className="conn-dot" /> {linkText}
        </span>
      </div>
    </div>
  );
}
