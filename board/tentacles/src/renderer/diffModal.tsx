import { useEffect, useState } from "react";
import type { DiffFile, DiffResult } from "../shared/ipc-contract";

function FileLines({ file }: { file: DiffFile }) {
  return (
    <>
      {file.hunks.map((h, hi) => (
        <div className="diff-hunk" key={hi}>
          {h.lines.map((l, li) => (
            <div className={`diff-line ${l.kind}`} key={li}>
              <span className="diff-sign">{l.kind === "add" ? "+" : l.kind === "del" ? "-" : " "}</span>
              <span className="diff-text">{l.text}</span>
            </div>
          ))}
        </div>
      ))}
    </>
  );
}

export function DiffModal({
  open,
  title,
  result,
  onClose,
  getFullFile,
}: {
  open: boolean;
  title: string;
  result: DiffResult | null;
  onClose: () => void;
  getFullFile: (filePath: string) => Promise<DiffFile | null>;
}) {
  const [selected, setSelected] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [fullByPath, setFullByPath] = useState<Record<string, DiffFile>>({});

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const files = result && result.ok ? result.files : [];
  const sel = files.length ? Math.min(selected, files.length - 1) : 0;
  const current = files[sel];

  const toggleExpand = async (path: string) => {
    if (expanded.has(path)) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(path);
        return next;
      });
      return;
    }
    if (!fullByPath[path]) {
      const full = await getFullFile(path);
      if (full) setFullByPath((prev) => ({ ...prev, [path]: full }));
    }
    setExpanded((prev) => new Set(prev).add(path));
  };

  let body: React.ReactNode;
  if (result === null) {
    body = <div className="diff-empty">Loading…</div>;
  } else if (!result.ok) {
    body = <div className="diff-empty">Could not load diff: {result.error}</div>;
  } else if (files.length === 0) {
    body = <div className="diff-empty">No changes on this branch yet.</div>;
  } else {
    const isExpanded = current ? expanded.has(current.path) : false;
    const shown = current && isExpanded && fullByPath[current.path] ? fullByPath[current.path] : current;
    body = (
      <div className="diff-layout">
        <nav className="diff-sidebar">
          {files.map((f, fi) => (
            <button
              key={`${f.path}\u0000${fi}`}
              className={`diff-file-item ${fi === sel ? "active" : ""}`}
              onClick={() => setSelected(fi)}
              title={f.path}
            >
              <span className={`diff-status ${f.status}`}>{f.status}</span>
              <span className="diff-file-name">{f.path}</span>
            </button>
          ))}
        </nav>
        <div className="diff-pane">
          {current && (
            <div className="diff-file-head">
              <span className={`diff-status ${current.status}`}>{current.status}</span>
              <span className="diff-path">{current.path}</span>
              <button className="diff-expand" onClick={() => void toggleExpand(current.path)}>
                {isExpanded ? "Collapse" : "Expand full file"}
              </button>
            </div>
          )}
          {shown && <FileLines file={shown} />}
        </div>
      </div>
    );
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
