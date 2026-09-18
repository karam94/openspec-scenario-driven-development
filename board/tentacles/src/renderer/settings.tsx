import { useEffect, useState } from "react";
import type { NotificationSetting, ResultRow, Target } from "../shared/ipc-contract";

const NOTIFICATION_OPTIONS: Array<{ value: NotificationSetting; label: string }> = [
  { value: "enabled", label: "Notifications on" },
  { value: "silent", label: "Mute notification sounds only" },
  { value: "muted", label: "Mute notifications" },
];

const TARGET_LABELS: { id: Target; label: string }[] = [
  { id: "claude", label: "Claude" },
  { id: "kiro", label: "Kiro" },
  { id: "kiro-crew", label: "Kiro Crew" },
];

type Tab = "general" | "setup";

// Map a doctor check row id to its check "kind": the target family it belongs to,
// or "shared" for the OpenSpec-slice checks every selected target relies on. The
// "kirocrew-" prefix is tested before "kiro-" so Kiro Crew checks are not
// misattributed.
function checkKind(id: string): Target | "shared" {
  if (id.startsWith("claude-")) return "claude";
  if (id.startsWith("kirocrew-")) return "kiro-crew";
  if (id.startsWith("kiro-")) return "kiro";
  return "shared";
}

// The run target(s) that COVER a given check, so a failing check repairs the
// selected target whose install produces it. Kiro Crew is a superset of Kiro, so
// an inherited `kiro-*` check is covered by kiro-crew as well as kiro — a
// `kiro-*` failure in a Kiro-Crew-only run therefore repairs kiro-crew (which
// re-runs the host-wiring + restart steps), not the standalone kiro target. A
// shared OpenSpec failure is covered by every target in the run.
function coveringTargets(checkId: string, ran: Target[]): Target[] {
  const kind = checkKind(checkId);
  if (kind === "shared") return ran;
  if (kind === "claude") return ran.filter((t) => t === "claude");
  if (kind === "kiro-crew") return ran.filter((t) => t === "kiro-crew");
  // a kiro-* check is produced by both the kiro and kiro-crew installs
  return ran.filter((t) => t === "kiro" || t === "kiro-crew");
}

// The target(s) a repair should re-install: for each failing row, the run
// target(s) that cover it. Snapshotted run targets keep the mapping stable even
// if the user toggles selection between Doctor and repair.
function affectedTargets(rows: ResultRow[], ranTargets: Target[]): Target[] {
  const affected = new Set<Target>();
  for (const r of rows) {
    if (r.ok) continue;
    for (const t of coveringTargets(r.id, ranTargets)) affected.add(t);
  }
  return TARGET_LABELS.map((x) => x.id).filter((t) => affected.has(t));
}

function ResultList({ title, rows }: { title: string; rows: ResultRow[] }) {
  return (
    <div className="setup-results">
      <div className="setup-results-title">{title}</div>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={r.ok ? "row-ok" : "row-fail"}>
            <span className="row-icon">{r.ok ? "✅" : "❌"}</span>
            <span className="row-label">{r.label}</span>
            {!r.ok && r.reason && <span className="row-reason">{r.reason}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function SettingsPanel({
  open,
  onClose,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tab, setTab] = useState<Tab>("general");
  const [root, setRoot] = useState("");
  const [notifications, setNotifications] = useState<NotificationSetting>("enabled");
  const [targets, setTargets] = useState<Target[]>([]);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [installResult, setInstallResult] = useState<ResultRow[] | null>(null);
  const [doctorResult, setDoctorResult] = useState<ResultRow[] | null>(null);
  const [doctorTargets, setDoctorTargets] = useState<Target[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setTab("general");
    setInstallResult(null);
    setDoctorResult(null);
    void (async () => {
      try {
        const s = await window.electronAPI.getSettings();
        setRoot(s.root);
        setNotifications(s.notifications ?? "enabled");
        setTargets(Array.isArray(s.targets) ? s.targets : []);
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

  const toggleTarget = (id: Target) => {
    setTargets((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await window.electronAPI.setSettings({ root, notifications, targets });
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

  const runInstall = async (only?: Target[]) => {
    setBusy(true);
    try {
      const res = await window.electronAPI.install({ targets: only ?? targets });
      setInstallResult(res.steps);
    } catch {
      setInstallResult([{ id: "install-error", label: "Install failed", ok: false, reason: "unexpected error" }]);
    } finally {
      setBusy(false);
    }
  };

  const runDoctor = async () => {
    setBusy(true);
    setDoctorTargets(targets);
    try {
      const res = await window.electronAPI.doctor({ targets });
      setDoctorResult(res.checks);
    } catch {
      setDoctorResult([{ id: "doctor-error", label: "Doctor failed", ok: false, reason: "unexpected error" }]);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  const doctorHasFailure = !!doctorResult && doctorResult.some((c) => !c.ok);
  const repairTargets = doctorResult ? affectedTargets(doctorResult, doctorTargets) : [];

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

        <div className="settings-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "general"}
            className={`settings-tab ${tab === "general" ? "active" : ""}`}
            onClick={() => setTab("general")}
          >
            General
          </button>
          <button
            role="tab"
            aria-selected={tab === "setup"}
            className={`settings-tab ${tab === "setup" ? "active" : ""}`}
            onClick={() => setTab("setup")}
          >
            Setup
          </button>
        </div>

        <div className="settings-body">
          {tab === "general" && (
            <>
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

              <span className="settings-label">Notifications</span>
              <div className="settings-radios" role="radiogroup" aria-label="Notifications">
                {NOTIFICATION_OPTIONS.map((opt) => (
                  <label key={opt.value} className="settings-radio">
                    <input
                      type="radio"
                      name="notifications"
                      value={opt.value}
                      checked={notifications === opt.value}
                      onChange={() => setNotifications(opt.value)}
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </>
          )}

          {tab === "setup" && (
            <div className="setup-panel">
              <div className="settings-label">Configure this machine for</div>
              <div className="setup-targets">
                {TARGET_LABELS.map(({ id, label }) => (
                  <label key={id} className="setup-target">
                    <input
                      type="checkbox"
                      aria-label={label}
                      checked={targets.includes(id)}
                      onChange={() => toggleTarget(id)}
                    />
                    {label}
                  </label>
                ))}
              </div>
              <div className="setup-actions">
                <button className="setup-install" onClick={() => void runInstall()} disabled={busy || targets.length === 0}>
                  Install
                </button>
                <button className="setup-doctor" onClick={() => void runDoctor()} disabled={busy || targets.length === 0}>
                  Run doctor
                </button>
              </div>
              {installResult && <ResultList title="Install" rows={installResult} />}
              {doctorResult && <ResultList title="Doctor" rows={doctorResult} />}
              {doctorHasFailure && (
                <button className="setup-repair" onClick={() => void runInstall(repairTargets)} disabled={busy}>
                  Fix detected issues
                </button>
              )}
            </div>
          )}

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
