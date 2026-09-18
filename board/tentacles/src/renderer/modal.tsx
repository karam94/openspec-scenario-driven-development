import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type ModalSection = { label: string; body: string };

export function Modal({
  open,
  title,
  sections,
  onClose,
}: {
  open: boolean;
  title: string;
  sections: ModalSection[];
  onClose: () => void;
}) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    setActive(0);
  }, [sections]);

  const multi = sections.length > 1;
  const current = sections[Math.min(active, Math.max(sections.length - 1, 0))];

  return (
    <div
      className={`overlay ${open ? "open" : ""}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("overlay")) onClose();
      }}
    >
      <div className="modal">
        <div className="modal-head">
          <span className="modal-title">{title}</span>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        {multi && (
          <div className="modal-tabs" role="tablist">
            {sections.map((s, i) => (
              <button
                key={`${s.label}\u0000${i}`}
                role="tab"
                aria-selected={i === active}
                className={`modal-tab ${i === active ? "active" : ""}`}
                onClick={() => setActive(i)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="modal-body">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              a: ({ node: _node, ...props }) => (
                <a {...props} target="_blank" rel="noopener noreferrer" />
              ),
            }}
          >
            {current?.body ?? ""}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
