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
  DiffFile,
  DiffHunk,
  DiffResult,
  NotificationSetting,
  Phase,
  PhaseId,
  Pr,
  ReadFileResult,
  StatusResult,
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

// Run a git subcommand and return its stdout, or null when the ref/command is
// invalid and produced nothing. `git diff` finds differences and still exits 0;
// `git diff --no-index` exits non-zero when files differ but writes the diff to
// stdout, so a non-empty stdout always wins over the exit code. No shell: the
// repo path and any file/ref are argv elements, never interpreted (see
// branchCommits for the same discipline).
function runGitText(repo: string, args: string[]): Promise<string | null> {
  return new Promise((resolve) => {
    execFile("git", ["-C", repo, ...args], { timeout: 8000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      const out = String(stdout ?? "");
      if (out.length > 0) return resolve(out);
      if (err) return resolve(null);
      resolve("");
    });
  });
}

// Resolve the merge base (fork point) of the current branch against its upstream
// base, trying origin/HEAD then master. Returns the merge-base commit sha, or null
// when neither ref resolves. Argv-only, no shell (see branchCommits).
async function mergeBase(repo: string): Promise<string | null> {
  for (const base of ["origin/HEAD", "master"]) {
    const out = await runGitText(repo, ["merge-base", base, "HEAD"]);
    if (out !== null && out.trim()) return out.trim();
  }
  return null;
}

// Tracked changes as one unified diff: merge-base → working tree, i.e. exactly what
// this branch contributes (committed-on-branch ∪ staged ∪ unstaged) while EXCLUDING
// commits that landed on the base after the branch diverged. Comparing against the
// base tip instead would report upstream-only files as branch removals. Falls back
// to HEAD (working tree vs last commit) when no base ref resolves. quotePath=false
// keeps non-ASCII paths literal in the diff headers.
async function trackedDiff(repo: string): Promise<string> {
  const base = await mergeBase(repo);
  if (base) {
    const out = await runGitText(repo, ["-c", "core.quotePath=false", "diff", base, "--"]);
    if (out !== null) return out;
  }
  const head = await runGitText(repo, ["-c", "core.quotePath=false", "diff", "HEAD", "--"]);
  return head ?? "";
}

// Untracked files are invisible to a normal diff, so each is rendered against
// /dev/null (an all-additions diff) and concatenated. -z gives NUL-delimited,
// unquoted paths so names with spaces, quotes, newlines, or non-ASCII survive
// intact (no trimming); quotePath=false keeps the diff header path literal too.
// --no-index exits 1 with the diff on stdout, which runGitText handles.
async function untrackedDiff(repo: string): Promise<string> {
  const list = await runGitText(repo, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const files = String(list ?? "").split("\0").filter((f) => f.length > 0);
  const parts: string[] = [];
  for (const f of files) {
    const d = await runGitText(repo, ["-c", "core.quotePath=false", "diff", "--no-index", "--", "/dev/null", f]);
    if (d) parts.push(d);
  }
  return parts.join("\n");
}

// Decode one git header path: strip a trailing CR, undo C-quoting (git wraps a
// name in double-quotes and backslash-escapes control chars, `"`, and `\` — with
// core.quotePath=false only single-byte escapes remain, so fromCharCode is exact),
// strip the trailing TAB git appends to terminate an unquoted path that contains
// spaces, and drop the leading a/ or b/ prefix. A legitimate trailing space in the
// name is preserved (only the tab terminator is removed).
function decodeGitPath(raw: string): string {
  let s = raw.replace(/\r$/, "");
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) {
    const body = s.slice(1, -1);
    const escapes: Record<string, string> = {
      n: "\n", t: "\t", r: "\r", a: "\x07", b: "\b", f: "\f", v: "\v", '"': '"', "\\": "\\",
    };
    let out = "";
    for (let i = 0; i < body.length; i++) {
      if (body[i] !== "\\") { out += body[i]; continue; }
      const n = body[i + 1] ?? "";
      if (n >= "0" && n <= "7") {
        out += String.fromCharCode(parseInt(body.slice(i + 1, i + 4), 8));
        i += 3;
      } else {
        out += escapes[n] ?? n;
        i += 1;
      }
    }
    s = out;
  } else {
    s = s.replace(/\t$/, "");
  }
  return s.replace(/^[ab]\//, "");
}

// Pure: raw unified-diff text → structured per-file model. Status is inferred from
// the git header lines (new file / deleted file / rename / Binary / --- +++ /dev/null),
// each hunk's lines classified add / del / context. Index and "\ No newline" lines
// are ignored.
export function parseDiff(raw: string): DiffFile[] {
  const files: DiffFile[] = [];
  let file: DiffFile | null = null;
  let hunk: DiffHunk | null = null;

  for (const line of String(raw ?? "").split("\n")) {
    if (line.startsWith("diff --git")) {
      const m = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
      file = { path: m ? decodeGitPath(m[2] as string) : "", status: "modified", hunks: [] };
      files.push(file);
      hunk = null;
      continue;
    }
    if (!file) continue;
    if (line.startsWith("new file")) { file.status = "added"; continue; }
    if (line.startsWith("deleted file")) { file.status = "deleted"; continue; }
    if (line.startsWith("rename to ")) { file.status = "renamed"; file.path = decodeGitPath(line.slice(10)); continue; }
    if (line.startsWith("rename from ")) { file.status = "renamed"; continue; }
    if (line.startsWith("Binary files")) { file.status = "binary"; continue; }
    if (line.startsWith("--- ")) {
      if (line.slice(4).replace(/\r$/, "") === "/dev/null") file.status = "added";
      continue;
    }
    if (line.startsWith("+++ ")) {
      const rawPath = line.slice(4).replace(/\r$/, "");
      if (rawPath === "/dev/null") file.status = "deleted";
      else file.path = decodeGitPath(line.slice(4));
      continue;
    }
    if (line.startsWith("@@")) {
      hunk = { lines: [] };
      file.hunks.push(hunk);
      continue;
    }
    if (line.startsWith("\\")) continue;
    if (!hunk) continue;
    if (line.startsWith("+")) hunk.lines.push({ kind: "add", text: line.slice(1) });
    else if (line.startsWith("-")) hunk.lines.push({ kind: "del", text: line.slice(1) });
    else if (line.startsWith(" ")) hunk.lines.push({ kind: "context", text: line.slice(1) });
  }
  return files;
}

// Guarded branch diff: only for a currently-discovered repo (mirrors readArtifact /
// archiveChange), returning the structured branch-vs-base ∪ working-tree model.
export async function getDiff(args: Args, repoPath: string): Promise<DiffResult> {
  const repos = discoverRepos(args);
  const okRepo = repos.some((r) => path.resolve(r) === path.resolve(repoPath || ""));
  if (!okRepo) return { ok: false, error: "unknown repo" };
  try {
    const raw = [await trackedDiff(repoPath), await untrackedDiff(repoPath)].filter(Boolean).join("\n");
    return { ok: true, files: parseDiff(raw) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// One file's diff with its ENTIRE contents as context (merge-base → working tree),
// so the renderer can show the whole file with the changes highlighted inline. A
// very large --unified window means git emits every unchanged line as context
// rather than the default three around each hunk. Falls back HEAD → untracked
// (--no-index vs /dev/null) exactly as the whole-repo diff does. Guarded to a
// discovered repo like getDiff; the file path is an argv element after `--`, never
// a shell token or an option.
async function fileDiffFullContext(repo: string, repoRoot: string, filePath: string): Promise<string> {
  const ctx = "--unified=1000000";
  const base = await mergeBase(repo);
  if (base) {
    const out = await runGitText(repo, ["-c", "core.quotePath=false", "diff", base, ctx, "--", filePath]);
    if (out) return out;
  }
  const head = await runGitText(repo, ["-c", "core.quotePath=false", "diff", "HEAD", ctx, "--", filePath]);
  if (head) return head;
  // The tracked diffs above also read working-tree state, but git treats an
  // outside-pointing intermediate symlink on a tracked pathspec as a deletion
  // rather than following it off disk. The --no-index fallback is the one path
  // that would follow such a symlink and read arbitrary bytes, so re-validate
  // containment at the point of use, not just at entry: the file must exist as a
  // regular file whose canonical path is still inside the repo right now. A
  // missing path has no untracked content to show and must never reach --no-index
  // — this closes the window where an ancestor absent at entry is created as an
  // outside-pointing symlink before this call. Tracked deletions never get here;
  // they resolve from git's tree above.
  const safe = containedRealPath(repoRoot, filePath);
  if (!safe) return "";
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(safe);
  } catch {
    return "";
  }
  if (!stat.isFile()) return "";
  const untracked = await runGitText(repo, ["-c", "core.quotePath=false", "diff", "--no-index", ctx, "--", "/dev/null", filePath]);
  return untracked ?? "";
}

// Canonicalize a repo-relative path for containment. path.resolve is lexical, so a
// symlinked directory inside the repo whose real target is outside would slip past a
// prefix check; realpath dereferences it. The requested file may not exist yet
// (deleted/untracked cases still reach git), so canonicalize the nearest existing
// ancestor and re-append the missing tail. Returns null when the real target escapes
// the repo's real root.
function containedRealPath(repoRoot: string, filePath: string): string | null {
  let root: string;
  try {
    root = fs.realpathSync(repoRoot);
  } catch {
    return null;
  }
  const target = path.resolve(root, filePath);
  let existing = target;
  const tail: string[] = [];
  while (!fs.existsSync(existing)) {
    tail.unshift(path.basename(existing));
    const parent = path.dirname(existing);
    if (parent === existing) break;
    existing = parent;
  }
  let canonical: string;
  try {
    canonical = fs.realpathSync(existing);
  } catch {
    return null;
  }
  const full = tail.length ? path.join(canonical, ...tail) : canonical;
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

export async function getFileDiff(args: Args, repoPath: string, filePath: string): Promise<DiffResult> {
  const repos = discoverRepos(args);
  const okRepo = repos.some((r) => path.resolve(r) === path.resolve(repoPath || ""));
  if (!okRepo) return { ok: false, error: "unknown repo" };
  if (!filePath) return { ok: false, error: "no file" };
  const repoRoot = path.resolve(repoPath);
  const canonical = containedRealPath(repoRoot, filePath);
  if (!canonical) return { ok: false, error: "path outside repo" };
  const relFile = path.relative(fs.realpathSync(repoRoot), canonical);
  try {
    return { ok: true, files: parseDiff(await fileDiffFullContext(repoPath, repoRoot, relFile)) };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
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
  parseDiff,
  getDiff,
  getFileDiff,
  shapeChange,
  computeNotifications,
  parseSettings,
  parseNotificationSetting,
  resolveNotifications,
  expandTilde,
  dirExists,
  validateRoot,
  resolveRoot,
  collect,
  getStatus,
  archiveChange,
  readArtifact,
};
