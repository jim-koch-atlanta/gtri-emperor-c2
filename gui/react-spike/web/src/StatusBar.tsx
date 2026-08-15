// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Top status bar. Glanceable swarm health (LIVE/STALE/LOST counts) — the seed of
// exception-based supervision (§9) — plus the connection state, which here also
// tells you WHICH client seam you're looking at: a browser talking to the bridge,
// talking to the same C2 server the WPF client uses.

import type { RobotState } from "./types";
import type { SwarmStatus } from "./useSwarm";
import { STATUS_COLOR } from "./viz";

interface Props {
  robots: RobotState[];
  status: SwarmStatus;
  basemap: "osm" | "dark";
  unackedCount: number;
  onToggleBasemap: () => void;
  onFitAll: () => void;
}

export function StatusBar({ robots, status, basemap, unackedCount, onToggleBasemap, onFitAll }: Props) {
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
        <button className="ghost" onClick={onFitAll}>Fit All</button>
        <button className="ghost" onClick={onToggleBasemap}>Basemap: {basemap === "osm" ? "OSM" : "Dark"}</button>
        <span className={`conn ${linkOk ? "ok" : "bad"}`} title={status.detail}>
          <span className="conn-dot" /> {linkText}
        </span>
      </div>
    </div>
  );
}
