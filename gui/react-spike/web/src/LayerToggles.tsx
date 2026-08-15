// THROWAWAY AI-GENERATED EXPLORATION — proves the API seam; not the submission.
//
// Map layer toggles for the mission geometry (left panel). The fence, the
// component buffers, and the raw mission inputs each toggle independently so the
// operator can declutter the tactical view.

import type { LayerVisibility } from "./MapView";
import { FENCE_UNION_COLOR, BUFFER_COLOR, INPUT_COLOR } from "./viz";

interface Props {
  vis: LayerVisibility;
  onToggle: (k: keyof LayerVisibility) => void;
}

const ROWS: { k: keyof LayerVisibility; label: string; color: string }[] = [
  { k: "mission", label: "Geofence", color: FENCE_UNION_COLOR },
  { k: "buffers", label: "Buffers", color: BUFFER_COLOR.fence_region_of_interest },
  { k: "inputs", label: "Mission inputs", color: INPUT_COLOR },
];

export function LayerToggles({ vis, onToggle }: Props) {
  return (
    <div className="layers">
      <div className="panel-title">MAP LAYERS</div>
      {ROWS.map((r) => (
        <label key={r.k} className="layer-row">
          <input type="checkbox" checked={vis[r.k]} onChange={() => onToggle(r.k)} />
          <span className="swatch" style={{ background: r.color }} />
          <span>{r.label}</span>
        </label>
      ))}
    </div>
  );
}
