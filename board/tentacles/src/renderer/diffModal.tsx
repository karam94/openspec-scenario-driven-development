import { useEffect } from "react";
import type { DiffResult } from "../shared/ipc-contract";

export function DiffModal({
  open,
  title,
  result,
  onClose,
}: {
  open: boolean;
  title: string;
  result: DiffResult | null;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  let body: React.ReactNode;
  if (result === null) {
    body = <div className="diff-empty">Loading…</div>;
  } else if (!result.ok) {
    body = <div className="diff-empty">Could not load diff: {result.error}</div>;
  } else if (result.files.length === 0) {
    body = <div className="diff-empty">No changes on this branch yet.</div>;
  } else {
    body = result.files.map((f, fi) => (
      <div className="diff-file" key={`${f.path}\u0000${fi}`}>
        <div className="diff-file-head">
          <span className={`diff-status ${f.status}`}>{f.status}</span>
          <span className="diff-path">{f.path}</span>
        </div>
        {f.hunks.map((h, hi) => (
          <div className="diff-hunk" key={hi}>
            {h.lines.map((l, li) => (
              <div className={`diff-line ${l.kind}`} key={li}>
                <span className="diff-sign">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
                <span className="diff-text">{l.text}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    ));
  }

  return (
    <div
      className={`diff-overlay ${open ? "open" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("diff-overlay")) onClose();
      }}
    >
      <div className="diff-modal">
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="diff-body">{body}</div>
      </div>
    </div>
  );
}
