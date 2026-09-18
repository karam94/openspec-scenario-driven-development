import { useEffect, useState } from "react";

export function SettingsPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [root, setRoot] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    void (async () => {
      try {
        const s = await window.electronAPI.getSettings();
        setRoot(s.root);
      } catch {
        /* leave blank */
      }
    })();
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await window.electronAPI.setSettings({ root });
      if (res.ok) {
        onSaved();
        onClose();
      } else {
        setError(res.error);
      }
    } catch {
      setError("Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const browse = async () => {
    setError("");
    try {
      const res = await window.electronAPI.chooseDirectory();
      if (res.path) setRoot(res.path);
    } catch {
      /* dialog cancelled or unavailable — leave the field untouched */
    }
  };

  if (!open) return null;

  return (
    <div
      className={`overlay open`}
      onClick={(e) => {
        if ((e.target as HTMLElement).classList.contains("overlay")) onClose();
      }}
    >
      <div className="modal settings-modal">
        <div className="modal-head">
          <span className="modal-title">Settings</span>
          <button className="modal-x" onClick={onClose}>
            ×
          </button>
        </div>
        <div className="settings-body">
          <label className="settings-label" htmlFor="settings-root">
            Scan root directory
          </label>
          <div className="settings-input-row">
            <input
              id="settings-root"
              className="settings-input"
              type="text"
              value={root}
              placeholder="~/Code"
              spellCheck={false}
              onChange={(e) => setRoot(e.target.value)}
            />
            <button className="settings-browse" type="button" onClick={() => void browse()}>
              Browse…
            </button>
          </div>
          {error && <div className="settings-error">{error}</div>}
          <div className="settings-actions">
            <button className="settings-save" onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
