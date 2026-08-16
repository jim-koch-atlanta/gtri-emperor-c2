// AI-ASSISTED EXPLORATION — the web-based C2 vision, a supporting exhibit for
// TECH_SPEC §9; the C++ core + WPF operator_gui are the primary submission.
//
// Left-panel toggles. MAP LAYERS declutters the mission geometry (fence / buffers
// / inputs); SITUATIONAL AWARENESS (round 3) toggles the predicted orbit and the
// coasting ghost. (The 2525 symbology toggle lives in the top bar with the other
// view-mode switches.)

import type { LayerVisibility, SaVisibility } from "./MapView";
import { FENCE_UNION_COLOR, BUFFER_COLOR, INPUT_COLOR } from "./viz";

interface Props {
  vis: LayerVisibility;
  onToggle: (k: keyof LayerVisibility) => void;
  saVis: SaVisibility;
  onToggleSa: (k: keyof SaVisibility) => void;
}

const LAYER_ROWS: { k: keyof LayerVisibility; label: string; color: string }[] = [
  { k: "mission", label: "Geofence", color: FENCE_UNION_COLOR },
  { k: "buffers", label: "Buffers", color: BUFFER_COLOR.fence_region_of_interest },
  { k: "inputs", label: "Mission inputs", color: INPUT_COLOR },
];

const SA_ROWS: { k: keyof SaVisibility; label: string; color: string }[] = [
  { k: "orbit", label: "Predicted orbit", color: "#58a6ff" },
  { k: "ghost", label: "Coasting ghost", color: "#8b949e" },
];

export function LayerToggles({ vis, onToggle, saVis, onToggleSa }: Props) {
  return (
    <div className="layers">
      <div className="panel-title">MAP LAYERS</div>
      {LAYER_ROWS.map((r) => (
        <label key={r.k} className="layer-row">
          <input type="checkbox" checked={vis[r.k]} onChange={() => onToggle(r.k)} />
          <span className="swatch" style={{ background: r.color }} />
          <span>{r.label}</span>
        </label>
      ))}
      <div className="panel-title">SITUATIONAL AWARENESS</div>
      {SA_ROWS.map((r) => (
        <label key={r.k} className="layer-row">
          <input type="checkbox" checked={saVis[r.k]} onChange={() => onToggleSa(r.k)} />
          <span className="swatch" style={{ background: r.color }} />
          <span>{r.label}</span>
        </label>
      ))}
    </div>
  );
}
