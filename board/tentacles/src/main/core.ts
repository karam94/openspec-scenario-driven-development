/*
 * OpenSpec Board — core logic.
 *
 * Forked from board/server.js at the introduction of the Electron app. These
 * are the board's discrete functions with the HTTP server, browser-open, and
 * CLI arg-parsing stripped out — the Electron main process invokes them
 * directly and exposes them over IPC.
 *
 * Zero runtime dependencies (node:child_process + node:fs + node:path + node:os).
 * The two guards from the HTTP board (archive scoped to a discovered repo + real
 * change; file reads scoped inside a discovered repo) are enforced here in
 * archiveChange() and readArtifact() so a renderer bug cannot bypass them.
 */

import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type {
  Apply,
  ArchiveResult,
  Change,
  NotificationSetting,
  Phase,
  PhaseId,
  Pr,
  ReadFileResult,
  StatusResult,
  Target,
} from "../shared/ipc-contract";

export type { NotificationSetting } from "../shared/ipc-contract";

export interface Args {
  repos: string[];
  root: string;
  depth: number;
}

type Archiver = (repoPath: string, change: string) => Promise<ArchiveResult>;

// The untrusted shapes the external CLIs emit — declared, then cast at the parse
// site. Optional-chaining fallbacks treat every field as possibly absent.
interface RawArtifactPath {
  existingOutputPaths?: Array<string | null>;
  resolvedOutputPath?: string | null;
}
interface RawStatus {
  artifactPaths?: Record<string, RawArtifactPath>;
  isPlanningComplete?: boolean;
  schemaName?: string;
}
interface RawPr {
  url: string;
  state: string;
  reviewDecision?: string;
  isDraft?: boolean;
}

export const PHASES: PhaseId[] = ["grill", "proposal", "specs", "design", "tasks"];

export const PRUNE = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "target",
  ".venv", "venv", "__pycache__", ".cache", ".next", ".turbo", "coverage",
  "vendor", ".idea", ".vscode", "Pods", "DerivedData",
]);
export const DEFAULT_DEPTH = 30;

// The app has no CLI flags (a double-clicked .app can't take them). It scans
// ~/Code at depth 30 — the same default as board/server.js. TENTACLES_ROOT /
// TENTACLES_DEPTH override the scan root/depth so a launched process can be
// pointed at a seeded fixtures tree (e2e); unset preserves today's behaviour.
export function defaultArgs(): Args {
  const root = process.env.TENTACLES_ROOT || path.join(os.homedir(), "Code");
  const parsedDepth = parseInt(process.env.TENTACLES_DEPTH || "", 10);
  const depth = Number.isFinite(parsedDepth) ? parsedDepth : DEFAULT_DEPTH;
  return { repos: [], root, depth };
}

export function isRepo(dir: string): boolean {
  try {
    return fs.statSync(path.join(dir, "openspec", "changes")).isDirectory();
  } catch {
    return false;
  }
}

export function scanRoot(root: string, maxDepth: number): string[] {
  const found: string[] = [];
  function walk(dir: string, depth: number): void {
    if (depth > maxDepth) return;
    if (isRepo(dir)) {
      found.push(dir);
      return;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (!e.isDirectory() || e.isSymbolicLink()) continue;
      if (PRUNE.has(e.name) || e.name.startsWith(".")) continue;
      walk(path.join(dir, e.name), depth + 1);
    }
  }
  walk(root, 0);
  return found;
}

export function discoverRepos(args: Args): string[] {
  if (args.repos.length) return args.repos.filter(isRepo);
  return scanRoot(args.root, args.depth);
}

export function listChanges(repo: string): string[] {
  const dir = path.join(repo, "openspec", "changes");
  let names: string[] = [];
  try {
    names = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== "archive")
      .map((e) => e.name);
  } catch {
    /* none */
  }
  return names;
}

export function runStatus(repo: string, change: string): Promise<RawStatus | null> {
  return new Promise((resolve) => {
    execFile(
      "openspec",
      ["status", "--change", change, "--json"],
      { cwd: repo, timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return resolve(null);
        try {
          resolve(JSON.parse(String(stdout)) as RawStatus);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

export function runArchive(repo: string, change: string): Promise<ArchiveResult> {
  return new Promise((resolve) => {
    execFile(
      "openspec",
      ["archive", change, "--yes", "--skip-specs", "--json"],
      { cwd: repo, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) return resolve({ ok: false, error: (stderr || String(err)).slice(0, 400) });
        resolve({ ok: true });
      }
    );
  });
}

interface TaskProgress {
  total: number;
  done: number;
  reviewTaskDone: boolean | null;
}

export function taskProgress(repo: string, change: string): TaskProgress {
  const p = path.join(repo, "openspec", "changes", change, "tasks.md");
  try {
    const text = fs.readFileSync(p, "utf8");
    const lines = text.split("\n").filter((l) => /^\s*-\s*\[[ xX]\]/.test(l));
    const ticked = (l: string): boolean => /^\s*-\s*\[[xX]\]/.test(l);
    const reviewLine = lines.find((l) => /code[- ]?review|review gate|independent .*review/i.test(l));
    const reviewTaskDone = reviewLine ? ticked(reviewLine) : null;
    const implLines = lines.filter(
      (l) => !/code[- ]?review|review gate|independent .*review|open the pr/i.test(l)
    );
    return {
      total: implLines.length,
      done: implLines.filter(ticked).length,
      reviewTaskDone,
    };
  } catch {
    return { total: 0, done: 0, reviewTaskDone: null };
  }
}

export function changeType(repo: string, change: string): "refactor" | "feature" {
  const p = path.join(repo, "openspec", "changes", change, "proposal.md");
  let text = "";
  try {
    text = fs.readFileSync(p, "utf8");
  } catch {
    return /^refactor[-/]/i.test(change) ? "refactor" : "feature";
  }

  if (/change type:\s*refactor/i.test(text)) return "refactor";
  if (/change type:\s*feature/i.test(text)) return "feature";

  const t = text.toLowerCase();
  const refactorSignals = [
    "behaviour-preserving", "behavior-preserving",
    "no observable-behaviour change", "no observable behaviour change",
    "no observable-behavior change", "no observable behavior change",
    "no production code is modified", "no production behaviour change",
    "implementation-only", "implementation only",
    "no requirement or production behaviour change",
  ];
  const hasRefactorLang = refactorSignals.some((s) => t.includes(s));
  const newCapBlock = (text.match(/###\s*New Capabilities([\s\S]*?)(?=\n##|\n###|$)/i) || [])[1] || "";
  const addsNewCapability = /^\s*-\s+\S/m.test(newCapBlock.replace(/<!--[\s\S]*?-->/g, ""));

  if (hasRefactorLang && !addsNewCapability) return "refactor";
  if (addsNewCapability) return "feature";

  return /^refactor[-/]/i.test(change) ? "refactor" : "feature";
}

export function changeBranch(repo: string, change: string): string | null {
  const p = path.join(repo, "openspec", "changes", change, "tasks.md");
  try {
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/^[ \t]*branch[ \t]*(?:[:=][ \t]*)?[`'"]([^`'"\s]+)[`'"]/im);
    if (m) return m[1] ?? null;
  } catch {
    /* none */
  }
  return null;
}

export function prForBranch(repo: string, branch: string | null): Promise<Pr | null> {
  return new Promise((resolve) => {
    if (!branch) return resolve(null);
    execFile(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--json", "url,state,reviewDecision,isDraft", "--limit", "1"],
      { cwd: repo, timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const arr = JSON.parse(String(stdout)) as RawPr[];
          const p = arr[0];
          resolve(p ? { url: p.url, state: p.state, reviewDecision: p.reviewDecision || "", isDraft: !!p.isDraft } : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

export function branchCommits(repo: string, branch: string | null): Promise<number> {
  // No shell: git runs via execFile with an argv array, so the repo path and the
  // branch name (parsed from a scanned repo's tasks.md, i.e. untrusted) are passed
  // literally and can never be interpreted as shell metacharacters. Falls back
  // from origin/HEAD to master in TS rather than a shell `||` chain.
  const countAgainst = (base: string): Promise<number | null> =>
    new Promise((res) => {
      execFile(
        "git",
        ["-C", repo, "rev-list", "--count", branch as string, `^${base}`],
        { timeout: 8000 },
        (err, stdout) => {
          if (err) return res(null);
          const n = parseInt(String(stdout).trim(), 10);
          res(Number.isFinite(n) ? n : null);
        }
      );
    });

  return (async () => {
    if (!branch) return 0;
    const primary = await countAgainst("origin/HEAD");
    if (primary !== null) return primary;
    const fallback = await countAgainst("master");
    return fallback ?? 0;
  })();
}

export async function shapeChange(repo: string, change: string, status: RawStatus | null): Promise<Change> {
  const artifactPaths = (status && status.artifactPaths) || {};
  const planningComplete = !!(status && status.isPlanningComplete);
  const ownExists = (id: PhaseId): boolean =>
    ((artifactPaths[id]?.existingOutputPaths || []).filter(Boolean) as string[]).length > 0;

  // A planning phase is complete when the NEXT applicable artifact exists — not
  // when its own artifact exists (grill.md is written mid-interview, so keying on
  // it marks grill done while grilling is still ongoing). The last applicable
  // planning phase has no successor, so it falls back to isPlanningComplete. See
  // ADR-0004.
  const applicableIds = PHASES.filter((id) => id in artifactPaths);
  const phases: Phase[] = PHASES.map((id) => {
    const ap = artifactPaths[id] || {};
    const existing = (ap.existingOutputPaths || []).filter(Boolean) as string[];
    const applicable = id in artifactPaths;
    const pos = applicableIds.indexOf(id);
    const nextId = pos >= 0 ? applicableIds[pos + 1] : undefined;
    const done = !applicable ? false : nextId ? ownExists(nextId) : planningComplete;
    const files = existing.length ? existing : ap.resolvedOutputPath ? [ap.resolvedOutputPath] : [];
    return {
      id,
      applicable,
      done,
      files,
      fileExists: existing.length > 0,
    };
  });
  const nextIdx = phases.findIndex((p) => p.applicable && !p.done);
  if (nextIdx !== -1) {
    const next = phases[nextIdx];
    if (next) next.inProgress = true;
  }

  const prog = taskProgress(repo, change);

  const type = changeType(repo, change);
  const branch = changeBranch(repo, change);
  const pr = planningComplete ? await prForBranch(repo, branch) : null;

  let apply: Apply = { total: prog.total, done: prog.done, source: "tasks.md", file: null };
  if (planningComplete && prog.total > 0 && prog.done === 0) {
    const commits = await branchCommits(repo, branch);
    if (commits > 0) apply = { total: prog.total, done: null, commits, source: "commits", file: null };
  }
  const applyDoneByTasks =
    (apply.source === "tasks.md" && apply.total > 0 && apply.done === apply.total) ||
    (apply.source === "commits" && !!pr);

  const ghApproved = pr && (pr.state === "MERGED" || pr.reviewDecision === "APPROVED");
  const reviewEntered = prog.reviewTaskDone === true || ghApproved || !!pr;
  let review: "none" | "pending" | "passed" = "none";
  if (prog.reviewTaskDone === true || ghApproved) review = "passed";
  else if (applyDoneByTasks || pr) review = "pending";
  const reviewPassed = review === "passed";

  const applyDone = applyDoneByTasks || reviewEntered;
  const applying = planningComplete && !applyDone;

  const complete = reviewPassed;

  const tasksFile = path.join(repo, "openspec", "changes", change, "tasks.md");
  apply.file = fs.existsSync(tasksFile) ? tasksFile : null;

  return {
    change,
    repo: path.basename(repo),
    repoPath: repo,
    schema: (status && status.schemaName) || "unknown",
    type,
    phases,
    apply,
    applyDone,
    applying,
    review,
    planningComplete,
    complete,
    pr,
  };
}

// ---------------------------------------------------------------------------
// Completion notifications (pure decision; the native Notification().show()
// lives in wiring.ts). The decision diffs the previous last-seen completion
// state against the freshly shaped changes and returns the edges to notify.
// ---------------------------------------------------------------------------

export interface BoardNotification {
  repo: string;
  change: string;
  kind: "phase" | "complete";
  phase?: string;
  title: string;
  body: string;
}

interface ChangeCompletionState {
  steps: string[];
  complete: boolean;
}

export type NotifyState = Record<string, ChangeCompletionState>;

function notifyKey(c: Change): string {
  return `${c.repoPath}\u0000${c.change}`;
}

// The completed "steps" of a change: each done planning phase, apply once done,
// review once passed, and done once the change is complete. The grill requires a
// per-phase notification for every phase including done; the whole-change edge is
// reported separately as `kind: "complete"`.
function completedSteps(c: Change): string[] {
  const steps: string[] = [];
  for (const p of c.phases) if (p.applicable && p.done) steps.push(p.id);
  if (c.applyDone) steps.push("apply");
  if (c.review === "passed") steps.push("review");
  if (c.complete) steps.push("done");
  return steps;
}

// Given the previous state (null on the first scan) and the freshly shaped
// changes, return the notifications to fire and the next state to remember. On
// the first scan the state is seeded and nothing fires, so a launch burst of
// pre-existing completions is suppressed.
export function computeNotifications(
  prev: NotifyState | null,
  changes: Change[]
): { next: NotifyState; notifications: BoardNotification[] } {
  const next: NotifyState = {};
  for (const c of changes) {
    next[notifyKey(c)] = { steps: completedSteps(c), complete: c.complete };
  }
  if (prev == null) return { next, notifications: [] };

  const notifications: BoardNotification[] = [];
  for (const c of changes) {
    const before = prev[notifyKey(c)] || { steps: [], complete: false };
    const seen = new Set(before.steps);
    for (const step of completedSteps(c)) {
      if (!seen.has(step)) {
        notifications.push({
          repo: c.repo,
          change: c.change,
          kind: "phase",
          phase: step,
          title: `${c.change} — ${step} complete`,
          body: `${c.repo}: ${step} phase finished`,
        });
      }
    }
    if (c.complete && !before.complete) {
      notifications.push({
        repo: c.repo,
        change: c.change,
        kind: "complete",
        title: `${c.change} complete`,
        body: `${c.repo}: all phases done`,
      });
    }
  }
  return { next, notifications };
}

// ---------------------------------------------------------------------------
// Scan-root settings (pure). The disk read/write of settings.json lives in
// wiring.ts; these functions own the shape, tilde expansion, validation, and
// the resolution order.
// ---------------------------------------------------------------------------

export interface Settings {
  root?: string;
  notifications?: NotificationSetting;
  targets?: Target[];
}

// Normalise any persisted/incoming value to a valid tri-state, defaulting to
// "enabled" (full banner + sound) for absent or unrecognised input.
export function parseNotificationSetting(v: unknown): NotificationSetting {
  return v === "silent" || v === "muted" || v === "enabled" ? v : "enabled";
}

export function parseSettings(text: string): Settings {
  try {
    const o = JSON.parse(text) as unknown;
    if (o && typeof o === "object") {
      const out: Settings = {};
      const root = (o as { root?: unknown }).root;
      if (typeof root === "string") out.root = root;
      const notifications = (o as { notifications?: unknown }).notifications;
      if (notifications === "silent" || notifications === "muted" || notifications === "enabled") {
        out.notifications = notifications;
      }
      const targets = parseTargets((o as { targets?: unknown }).targets);
      if (targets.length) out.targets = targets;
      return out;
    }
  } catch {
    /* fall through to empty */
  }
  return {};
}

// The effective notification preference for a persisted settings object.
export function resolveNotifications(settings: Settings): NotificationSetting {
  return parseNotificationSetting(settings.notifications);
}

export function expandTilde(p: string, home: string = os.homedir()): string {
  if (p === "~") return home;
  if (p.startsWith("~/")) return path.join(home, p.slice(2));
  return p;
}

export function dirExists(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export type ValidateResult = { ok: true; root: string } | { ok: false; error: string };

// Validate a user-entered scan root: trim, expand a leading ~, and confirm it
// resolves to an existing directory. `isDir` is injected so the check is unit
// testable without touching the real filesystem.
export function validateRoot(
  input: string,
  isDir: (p: string) => boolean = dirExists,
  home: string = os.homedir()
): ValidateResult {
  const raw = (input || "").trim();
  if (!raw) return { ok: false, error: "Enter a directory path." };
  const expanded = expandTilde(raw, home);
  if (!isDir(expanded)) return { ok: false, error: "That directory does not exist." };
  return { ok: true, root: expanded };
}

// Resolution order: persisted setting → TENTACLES_ROOT env → ~/Code.
export function resolveRoot(
  settings: Settings,
  env: NodeJS.ProcessEnv = process.env,
  home: string = os.homedir()
): string {
  if (settings.root) return settings.root;
  return env.TENTACLES_ROOT || path.join(home, "Code");
}

export async function collect(repos: string[]): Promise<StatusResult> {
  const changes: Change[] = [];
  for (const repo of repos) {
    for (const change of listChanges(repo)) {
      const status = await runStatus(repo, change);
      changes.push(await shapeChange(repo, change, status));
    }
  }
  return { generatedAt: new Date().toISOString(), repoCount: repos.length, changes };
}

// The board's full status payload for the current scan defaults.
export async function getStatus(args: Args = defaultArgs()): Promise<StatusResult> {
  const repos = discoverRepos(args);
  try {
    return await collect(repos);
  } catch (e) {
    return { error: String(e), changes: [] };
  }
}

// Guarded archive: only for a currently-discovered repo AND a real change.
// `archiver` is injectable so the guard is testable without shelling out.
export async function archiveChange(
  args: Args,
  repoPath: string,
  change: string,
  archiver: Archiver = runArchive
): Promise<ArchiveResult> {
  const repos = discoverRepos(args);
  const okRepo = repos.some((r) => path.resolve(r) === path.resolve(repoPath || ""));
  if (!okRepo || !change || !listChanges(repoPath).includes(change)) {
    return { ok: false, error: "unknown repo or change" };
  }
  return archiver(repoPath, change);
}

// Guarded read: only a path resolving inside a currently-discovered repo.
export function readArtifact(args: Args, fp: string): ReadFileResult {
  const repos = discoverRepos(args);
  const allowed = repos.some((r) => path.resolve(String(fp || "")).startsWith(path.resolve(r) + path.sep));
  if (!allowed) {
    return { ok: false, error: "path outside discovered repos" };
  }
  try {
    return { ok: true, contents: fs.readFileSync(fp, "utf8") };
  } catch {
    return { ok: false, error: "not found" };
  }
}

// ---------------------------------------------------------------------------
// Setup tool: install planner + doctor checker (pure), the bundle-root resolver,
// and the thin real fs/exec boundary. The planner/checker return DATA (labelled
// steps/checks); wiring.ts iterates them against an injected executor/probe so
// the decision logic is unit-testable without touching disk — the same seam
// `archiveChange` uses via its injectable `archiver`.
// ---------------------------------------------------------------------------

export const KNOWN_TARGETS: Target[] = ["claude", "kiro", "kiro-crew"];

// The workflows the atdd-driven profile must expose (written by Install into the
// global OpenSpec config AND verified in full by Doctor). Matches the
// openspec-setup skill's canonical list.
export const OPENSPEC_WORKFLOWS: string[] = [
  "propose", "explore", "apply", "update", "sync", "archive",
  "new", "continue", "ff", "verify", "bulk-archive", "onboard",
];

// Pure doctor-probe parsers (the probe boundary in wiring.ts shells out; these
// decide pass/fail from the output, so they are unit-tested here).

// Which required workflows are absent from the configured set.
export function missingWorkflows(have: string[], required: string[]): string[] {
  return required.filter((r) => !have.includes(r));
}

// `kirocrew doctor` prints "strict identity: ✅ routed" when healthy and a
// negative such as "strict identity: not routed" otherwise, amongst other rows
// (e.g. "kirocrew-core route: ✅ routed"). Isolate the `strict identity:` row so
// a `routed` token on an unrelated row cannot make an unhealthy identity pass;
// then require the positive state on that row AND reject its negative.
export function strictIdentityRouted(output: string): boolean {
  const row = output
    .split(/\r?\n/)
    .find((line) => /strict\s+identity\s*:/i.test(line));
  if (row === undefined) return false;
  return /\brouted\b/i.test(row) && !/\bnot\s+routed\b/i.test(row);
}

// `kirocrew config get agent.session_control` prints the boolean value.
export function sessionControlEnabled(output: string): boolean {
  return /^\s*true\s*$/i.test(output) || /:\s*true\b/i.test(output);
}

// Read a targets array from an untrusted settings body, keeping only known
// target ids (mirrors how parseSettings already ignores a non-string root).
export function parseTargets(value: unknown): Target[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is Target => typeof v === "string" && (KNOWN_TARGETS as string[]).includes(v));
}

// A planned install step: a labelled, typed operation. Data, not a call.
export type InstallStep =
  | { id: string; label: string; kind: "copy-dir"; from: string; to: string; dereference?: boolean }
  | { id: string; label: string; kind: "copy-glob"; fromDir: string; prefix: string; to: string }
  | { id: string; label: string; kind: "write-file"; to: string; contents: string }
  | { id: string; label: string; kind: "run-command"; command: string; args: string[]; cwd?: string }
  | { id: string; label: string; kind: "detect-tool"; command: string; hint: string };

// A planned doctor check: a labelled probe. Data, not a call.
export type DoctorCheck =
  | { id: string; label: string; kind: "dir-exists"; path: string }
  | { id: string; label: string; kind: "prompts-exist"; dir: string }
  | { id: string; label: string; kind: "openspec-cli" }
  | { id: string; label: string; kind: "openspec-profile"; configPath: string }
  | { id: string; label: string; kind: "openspec-workflows"; configPath: string; required: string[] }
  | { id: string; label: string; kind: "kirocrew-identity" }
  | { id: string; label: string; kind: "kirocrew-session-control" };

export interface PlanContext {
  repoRoot: string;
  home: string;
}

// Walk up from a starting directory to the openspec-sdd-configure-tool repo root
// (the dir that holds skills/ + agents/ + openspec/schemas). Used so Install
// copies from the local checkout the app runs from (grill D4). Injectable start
// + exists for testing.
export function resolveBundleRoot(
  start: string = __dirname,
  exists: (p: string) => boolean = (p) => fs.existsSync(p)
): string | null {
  let dir = start;
  for (let i = 0; i < 12; i++) {
    if (exists(path.join(dir, "skills")) && exists(path.join(dir, "openspec", "schemas"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

// Pure install planner. Returns the ordered, deduplicated step list for the
// selected targets: each target's file copies, plus the shared OpenSpec global
// slice, with Kiro Crew adding the host-wiring + restart steps on top of Kiro.
// Steps are keyed by id and deduplicated so a multi-select install is idempotent.
export function planInstall(targets: Target[], ctx: PlanContext): InstallStep[] {
  const { repoRoot, home } = ctx;
  const steps: InstallStep[] = [];

  const stepsForTarget = (t: Target): InstallStep[] => {
    switch (t) {
      case "claude":
        return [
          { id: "claude-skills", label: "Copy skills → ~/.claude/skills", kind: "copy-dir", from: path.join(repoRoot, "skills"), to: path.join(home, ".claude", "skills") },
          { id: "claude-agents", label: "Copy agent adapters → ~/.claude/agents", kind: "copy-dir", from: path.join(repoRoot, ".claude", "agents"), to: path.join(home, ".claude", "agents") },
        ];
      case "kiro":
        return [
          { id: "kiro-skills", label: "Copy skills → ~/.kiro/skills", kind: "copy-dir", from: path.join(repoRoot, "skills"), to: path.join(home, ".kiro", "skills") },
          { id: "kiro-agents", label: "Copy agent adapters (dereferenced) → ~/.kiro/agents", kind: "copy-dir", from: path.join(repoRoot, ".kiro", "agents"), to: path.join(home, ".kiro", "agents"), dereference: true },
          { id: "kiro-prompts-generate", label: "Generate opsx-* prompts (openspec init --tools kiro)", kind: "run-command", command: "openspec", args: ["init", "--tools", "kiro", "--profile", "custom", "--no-copilot-cloud"], cwd: repoRoot },
          { id: "kiro-prompts", label: "Copy opsx-* prompts → ~/.kiro/prompts", kind: "copy-glob", fromDir: path.join(repoRoot, ".kiro", "prompts"), prefix: "opsx-", to: path.join(home, ".kiro", "prompts") },
        ];
      case "kiro-crew":
        return [
          ...stepsForTarget("kiro"),
          { id: "crew-wiring", label: "Run setup-kiro-crew.sh (host wiring)", kind: "run-command", command: path.join(repoRoot, "scripts", "setup-kiro-crew.sh"), args: [], cwd: repoRoot },
          { id: "crew-restart", label: "Restart the Kiro Crew gateway", kind: "run-command", command: "kirocrew", args: ["restart"] },
        ];
    }
  };

  for (const t of KNOWN_TARGETS) if (targets.includes(t)) steps.push(...stepsForTarget(t));

  // The OpenSpec global slice — shared by every target. Detect-only for the CLI
  // (never an install step), plus the profile/workflows write and the schema.
  if (targets.length > 0) {
    steps.push(
      { id: "openspec-cli", label: "Detect the OpenSpec CLI", kind: "detect-tool", command: "openspec", hint: "openspec not found — install it (e.g. npm i -g openspec) and re-run" },
      {
        id: "openspec-profile",
        label: "Set OpenSpec profile → custom (with workflows)",
        kind: "write-file",
        to: path.join(home, ".config", "openspec", "config.json"),
        contents: JSON.stringify({ profile: "custom", workflows: OPENSPEC_WORKFLOWS }, null, 2),
      },
      { id: "openspec-schema", label: "Install the atdd-driven schema", kind: "copy-dir", from: path.join(repoRoot, "openspec", "schemas", "atdd-driven"), to: path.join(home, ".config", "openspec", "schemas", "atdd-driven") }
    );
  }

  // Deduplicate by id, preserving first occurrence (keeps a multi-select install
  // idempotent — shared Kiro steps and the OpenSpec slice appear once).
  const seen = new Set<string>();
  return steps.filter((s) => (seen.has(s.id) ? false : (seen.add(s.id), true)));
}

// Pure doctor checker. Returns the ordered check list scoped to the selected
// targets, plus the shared OpenSpec checks. Mirrors what planInstall lays down.
export function planDoctorChecks(targets: Target[], ctx: { home: string }): DoctorCheck[] {
  const { home } = ctx;
  const checks: DoctorCheck[] = [];

  const checksForTarget = (t: Target): DoctorCheck[] => {
    switch (t) {
      case "claude":
        return [
          { id: "claude-skills", label: "Claude skills present", kind: "dir-exists", path: path.join(home, ".claude", "skills") },
          { id: "claude-agents", label: "Claude agent adapters present", kind: "dir-exists", path: path.join(home, ".claude", "agents") },
        ];
      case "kiro":
        return [
          { id: "kiro-skills", label: "Kiro skills present", kind: "dir-exists", path: path.join(home, ".kiro", "skills") },
          { id: "kiro-agents", label: "Kiro agent adapters present", kind: "dir-exists", path: path.join(home, ".kiro", "agents") },
          { id: "kiro-prompts", label: "opsx-* prompts present", kind: "prompts-exist", dir: path.join(home, ".kiro", "prompts") },
        ];
      case "kiro-crew":
        return [
          ...checksForTarget("kiro"),
          { id: "kirocrew-identity", label: "Kiro Crew strict identity routed", kind: "kirocrew-identity" },
          { id: "kirocrew-session-control", label: "agent.session_control enabled", kind: "kirocrew-session-control" },
        ];
    }
  };

  for (const t of KNOWN_TARGETS) if (targets.includes(t)) checks.push(...checksForTarget(t));

  if (targets.length > 0) {
    const configPath = path.join(home, ".config", "openspec", "config.json");
    checks.push(
      { id: "openspec-cli", label: "OpenSpec CLI present", kind: "openspec-cli" },
      { id: "openspec-profile", label: "OpenSpec profile is custom", kind: "openspec-profile", configPath },
      { id: "openspec-workflows", label: "OpenSpec workflows configured", kind: "openspec-workflows", configPath, required: OPENSPEC_WORKFLOWS },
      { id: "openspec-schema", label: "atdd-driven schema installed", kind: "dir-exists", path: path.join(home, ".config", "openspec", "schemas", "atdd-driven") }
    );
  }

  const seen = new Set<string>();
  return checks.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

export default {
  PHASES,
  PRUNE,
  DEFAULT_DEPTH,
  defaultArgs,
  isRepo,
  scanRoot,
  discoverRepos,
  listChanges,
  runStatus,
  runArchive,
  taskProgress,
  changeType,
  changeBranch,
  prForBranch,
  branchCommits,
  shapeChange,
  computeNotifications,
  parseSettings,
  parseNotificationSetting,
  resolveNotifications,
  expandTilde,
  dirExists,
  validateRoot,
  resolveRoot,
  parseTargets,
  resolveBundleRoot,
  planInstall,
  planDoctorChecks,
  OPENSPEC_WORKFLOWS,
  missingWorkflows,
  strictIdentityRouted,
  sessionControlEnabled,
  collect,
  getStatus,
  archiveChange,
  readArtifact,
};
