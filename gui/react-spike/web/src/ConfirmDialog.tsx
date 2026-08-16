// THROWAWAY AI-GENERATED EXPLORATION (round 3) — proves the API seam; not the submission.
//
// Confirmation gate for wide/destructive commands (ALL-STOP, or any command
// targeting >3 robots). Destructive-command UX doctrine: state the SCOPE
// explicitly before it fires. A modal, not a toast — it must be dismissed.

interface Props {
  title: string;
  lines: string[];
  danger?: boolean;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({ title, lines, danger, confirmLabel = "Confirm", onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className={`modal${danger ? " danger" : ""}`} onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>
        <div className="modal-body">
          {lines.map((l, i) => (
            <div key={i} className="modal-line">{l}</div>
          ))}
        </div>
        <div className="modal-actions">
          <button className="ghost" onClick={onCancel}>Cancel</button>
          <button className={danger ? "apply danger" : "apply"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
