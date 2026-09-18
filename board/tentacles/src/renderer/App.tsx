import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Change, DiffResult, StatusResult } from "../shared/ipc-contract";
import { RepoGroup } from "./board";
import { Modal, type ModalSection } from "./modal";
import { DiffModal } from "./diffModal";
import { SettingsPanel } from "./settings";

const REFRESH_MS = 15000;
type ThemeChoice = "light" | "dark" | null;

const keyOf = (c: Change) => `${c.repoPath}\u0000${c.change}`;

// specs/<capability>/spec.md → <capability>; used as the tab label when several
// spec files are shown together. Falls back to the file name for other shapes.
function capabilityOf(file: string): string {
  const m = file.match(/specs\/([^/]+)\/[^/]+$/);
  return m ? (m[1] as string) : (file.split("/").pop() ?? file);
}

function readSavedTheme(): ThemeChoice {
  const saved = localStorage.getItem("osb-theme");
  return saved === "light" || saved === "dark" ? saved : null;
}

function readCollapsed(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem("osb-collapsed") || "[]") as string[]);
  } catch {
    return new Set();
  }
}

export default function App() {
  const [status, setStatus] = useState<StatusResult | null>(null);
  const [stale, setStale] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [updatedAt, setUpdatedAt] = useState("");
  const [theme, setTheme] = useState<ThemeChoice>(() => readSavedTheme());
  const [collapsed, setCollapsed] = useState<Set<string>>(() => readCollapsed());
  const [archived, setArchived] = useState<Set<string>>(() => new Set());
  const [archiving, setArchiving] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<Set<string>>(() => new Set());
  const inFlight = useRef<Set<string>>(new Set());
  const [modal, setModal] = useState<{ open: boolean; title: string; sections: ModalSection[] }>({
    open: false,
    title: "",
    sections: [],
  });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [diff, setDiff] = useState<{ open: boolean; repoPath: string | null; result: DiffResult | null }>({
    open: false,
    repoPath: null,
    result: null,
  });

  useLayoutEffect(() => {
    if (theme) document.documentElement.setAttribute("data-theme", theme);
    else document.documentElement.removeAttribute("data-theme");
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const effective = prev || (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
      const next: ThemeChoice = effective === "dark" ? "light" : "dark";
      localStorage.setItem("osb-theme", next);
      return next;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const data = await window.electronAPI.getStatus();
      setStatus(data);
      setStale(false);
      setRefreshFailed(false);
      setUpdatedAt(new Date().toLocaleTimeString());
      if (!("error" in data)) {
        const present = new Set(data.changes.map(keyOf));
        setArchived((prev) => {
          const next = new Set([...prev].filter((k) => present.has(k)));
          return next.size === prev.size ? prev : next;
        });
      }
    } catch {
      setStale(true);
      setRefreshFailed(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const openArtifacts = useCallback(async (files: string[]) => {
    if (files.length === 0) return;
    const single = files.length === 1;
    const title = single ? (files[0] as string) : `${files.length} spec files`;
    setModal({ open: true, title, sections: [{ label: "", body: "Loading…" }] });
    try {
      const sections = await Promise.all(
        files.map(async (file) => {
          let contents = "Could not read file.";
          try {
            const res = await window.electronAPI.readFile(file);
            if (res.ok) contents = res.contents;
          } catch {
            /* keep the fallback */
          }
          return { label: capabilityOf(file), body: contents };
        })
      );
      setModal({ open: true, title, sections });
    } catch {
      setModal({ open: true, title, sections: [{ label: "", body: "Could not read file." }] });
    }
  }, []);

  const closeModal = useCallback(() => setModal((m) => ({ ...m, open: false })), []);

  const fetchDiff = useCallback(async (repoPath: string) => {
    try {
      const result = await window.electronAPI.getDiff(repoPath);
      setDiff((d) => (d.open && d.repoPath === repoPath ? { ...d, result } : d));
    } catch {
      setDiff((d) =>
        d.open && d.repoPath === repoPath ? { ...d, result: { ok: false, error: "diff unavailable" } } : d
      );
    }
  }, []);

  const openDiff = useCallback(
    (repoPath: string) => {
      setDiff({ open: true, repoPath, result: null });
      void fetchDiff(repoPath);
    },
    [fetchDiff]
  );

  const closeDiff = useCallback(() => setDiff((d) => ({ ...d, open: false })), []);

  useEffect(() => {
    if (!diff.open || !diff.repoPath) return;
    const repoPath = diff.repoPath;
    const id = setInterval(() => void fetchDiff(repoPath), REFRESH_MS);
    return () => clearInterval(id);
  }, [diff.open, diff.repoPath, fetchDiff]);

  const onArchive = useCallback(
    async (c: Change) => {
      const k = keyOf(c);
      if (inFlight.current.has(k)) return; // guard against a duplicate submission
      const confirmed = window.confirm(
        `Archive "${c.change}"?\n\nThis runs \`openspec archive\` (moves it to changes/archive/). Reversible on disk.`
      );
      if (!confirmed) return;
      inFlight.current.add(k);
      setArchiving((prev) => new Set(prev).add(k));
      const clearArchiving = () =>
        setArchiving((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      try {
        const d = await window.electronAPI.archive({ repoPath: c.repoPath, change: c.change });
        if (d.ok) {
          clearArchiving();
          setRemoving((prev) => new Set(prev).add(k));
          setTimeout(() => {
            inFlight.current.delete(k);
            setArchived((prev) => new Set(prev).add(k));
            setRemoving((prev) => {
              const next = new Set(prev);
              next.delete(k);
              return next;
            });
            void refresh();
          }, 320);
        } else {
          window.alert("Archive failed: " + (d.error || "unknown"));
          inFlight.current.delete(k);
          clearArchiving();
        }
      } catch (e) {
        window.alert("Archive failed: " + e);
        inFlight.current.delete(k);
        clearArchiving();
      }
    },
    [refresh]
  );

  const toggleRepo = useCallback((repo: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(repo)) next.delete(repo);
      else next.add(repo);
      localStorage.setItem("osb-collapsed", JSON.stringify([...next]));
      return next;
    });
  }, []);

  const grouped = useMemo(() => {
    if (!status || "error" in status) return [];
    const visible = status.changes.filter((c) => !archived.has(keyOf(c)));
    const byRepo = new Map<string, Change[]>();
    for (const c of visible) {
      const list = byRepo.get(c.repo);
      if (list) list.push(c);
      else byRepo.set(c.repo, [c]);
    }
    for (const list of byRepo.values()) {
      list.sort((a, b) => (a.complete ? 1 : 0) - (b.complete ? 1 : 0) || a.change.localeCompare(b.change));
    }
    return [...byRepo.keys()].sort().map((repo) => ({ repo, list: byRepo.get(repo) as Change[] }));
  }, [status, archived]);

  const repoCount = status && "repoCount" in status ? status.repoCount : 0;
  const changeCount = status && "changes" in status ? status.changes.length : 0;
  const statusText = refreshFailed
    ? "refresh failed — retrying"
    : status
      ? `${changeCount} change(s) · ${repoCount} repo(s) · updated ${updatedAt}`
      : "connecting…";

  let main: React.ReactNode;
  if (!status) {
    main = <div className="empty">Loading…</div>;
  } else if ("error" in status) {
    main = <div className="err">Error: {status.error}</div>;
  } else if (grouped.length === 0) {
    main = <div className="empty">No active OpenSpec changes found across {repoCount} repo(s).</div>;
  } else {
    main = grouped.map(({ repo, list }) => (
      <RepoGroup
        key={repo}
        repo={repo}
        list={list}
        collapsed={collapsed.has(repo)}
        onToggle={toggleRepo}
        openArtifacts={openArtifacts}
        openDiff={openDiff}
        onArchive={onArchive}
        archivingKeys={archiving}
        removingKeys={removing}
      />
    ));
  }

  return (
    <>
      <header>
        <h1>🗂️ OpenSpec Board</h1>
        <div className="meta">
          <button className="settings-btn" onClick={() => setSettingsOpen(true)} title="Settings">
            ⚙
          </button>
          <button className="theme-btn" onClick={toggleTheme} title="Toggle dark / light">
            🌓
          </button>
          <span className={`dot ${stale ? "stale" : ""}`} />
          <span>{statusText}</span>
        </div>
      </header>
      <main>{main}</main>
      <Modal open={modal.open} title={modal.title} sections={modal.sections} onClose={closeModal} />
      {diff.open && (
        <DiffModal
          open={diff.open}
          title={diff.repoPath ? `Branch diff — ${diff.repoPath.split("/").pop()}` : "Branch diff"}
          result={diff.result}
          onClose={closeDiff}
        />
      )}
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} onSaved={() => void refresh()} />
    </>
  );
}
