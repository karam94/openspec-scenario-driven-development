/*
 * OpenSpec Board — core logic.
 *
 * Forked from board/server.js at the introduction of the Electron app
 * (change: board-electron-app). These are the board's discrete functions with
 * the HTTP server, browser-open, and CLI arg-parsing stripped out — the
 * Electron main process invokes them directly and exposes them over IPC.
 *
 * Zero runtime dependencies (node:child_process + node:fs + node:path + node:os).
 * The two guards from the HTTP board (archive scoped to a discovered repo + real
 * change; file reads scoped inside a discovered repo) are enforced here in
 * archiveChange() and readArtifact() so a renderer bug cannot bypass them.
 */

const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PHASES = ["grill", "proposal", "specs", "design", "tasks"];

const PRUNE = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "target",
  ".venv", "venv", "__pycache__", ".cache", ".next", ".turbo", "coverage",
  "vendor", ".idea", ".vscode", "Pods", "DerivedData",
]);
const DEFAULT_DEPTH = 30;

// The app has no CLI flags (a double-clicked .app can't take them): scan the
// same defaults `node board/server.js` uses with no arguments.
function defaultArgs() {
  return { repos: [], root: path.join(os.homedir(), "Code"), depth: DEFAULT_DEPTH };
}

function isRepo(dir) {
  try {
    return fs.statSync(path.join(dir, "openspec", "changes")).isDirectory();
  } catch {
    return false;
  }
}

function scanRoot(root, maxDepth) {
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (isRepo(dir)) { found.push(dir); return; }
    let entries = [];
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

function discoverRepos(args) {
  if (args.repos.length) return args.repos.filter(isRepo);
  return scanRoot(args.root, args.depth);
}

function listChanges(repo) {
  const dir = path.join(repo, "openspec", "changes");
  let names = [];
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

function runStatus(repo, change) {
  return new Promise((resolve) => {
    execFile(
      "openspec",
      ["status", "--change", change, "--json"],
      { cwd: repo, timeout: 15000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => {
        if (err && !stdout) return resolve(null);
        try {
          resolve(JSON.parse(stdout));
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function runArchive(repo, change) {
  return new Promise((resolve) => {
    execFile(
      "openspec",
      ["archive", change, "--yes", "--skip-specs", "--json"],
      { cwd: repo, timeout: 30000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return resolve({ ok: false, error: (stderr || String(err)).slice(0, 400) });
        resolve({ ok: true });
      }
    );
  });
}

function taskProgress(repo, change) {
  const p = path.join(repo, "openspec", "changes", change, "tasks.md");
  try {
    const text = fs.readFileSync(p, "utf8");
    const lines = text.split("\n").filter((l) => /^\s*-\s*\[[ xX]\]/.test(l));
    const ticked = (l) => /^\s*-\s*\[[xX]\]/.test(l);
    const reviewLine = lines.find((l) => /code[- ]?review|review gate|independent .*review/i.test(l));
    const reviewTaskDone = reviewLine ? ticked(reviewLine) : null;
    const implLines = lines.filter((l) => !/code[- ]?review|review gate|independent .*review|open the pr/i.test(l));
    return {
      total: implLines.length,
      done: implLines.filter(ticked).length,
      reviewTaskDone,
    };
  } catch {
    return { total: 0, done: 0, reviewTaskDone: null };
  }
}

function changeType(repo, change) {
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

function changeBranch(repo, change) {
  const p = path.join(repo, "openspec", "changes", change, "tasks.md");
  try {
    const text = fs.readFileSync(p, "utf8");
    const m = text.match(/branch\s*[`'"]([^`'"\s]+)[`'"]/i);
    if (m) return m[1];
  } catch {
    /* none */
  }
  return null;
}

function prForBranch(repo, branch) {
  return new Promise((resolve) => {
    if (!branch) return resolve(null);
    execFile(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--json", "url,state,reviewDecision,isDraft", "--limit", "1"],
      { cwd: repo, timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const arr = JSON.parse(stdout);
          const p = arr[0];
          resolve(p ? { url: p.url, state: p.state, reviewDecision: p.reviewDecision || "", isDraft: !!p.isDraft } : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

function branchCommits(repo, branch) {
  return new Promise((resolve) => {
    if (!branch) return resolve(0);
    execFile(
      "bash",
      ["-c", `git -C '${repo}' rev-list --count ${branch} ^origin/HEAD 2>/dev/null || git -C '${repo}' rev-list --count ${branch} ^master 2>/dev/null || echo 0`],
      { timeout: 8000 },
      (err, stdout) => resolve(err ? 0 : parseInt(String(stdout).trim(), 10) || 0)
    );
  });
}

async function shapeChange(repo, change, status) {
  const artifactPaths = (status && status.artifactPaths) || {};
  const phases = PHASES.map((id) => {
    const ap = artifactPaths[id] || {};
    const existing = (ap.existingOutputPaths || []).filter(Boolean);
    const applicable = id in artifactPaths;
    return {
      id,
      applicable,
      done: existing.length > 0,
      file: existing[0] || (ap.resolvedOutputPath ?? null),
    };
  });
  const nextIdx = phases.findIndex((p) => p.applicable && !p.done);
  if (nextIdx !== -1) phases[nextIdx].inProgress = true;

  const prog = taskProgress(repo, change);
  const planningComplete = !!(status && status.isPlanningComplete);

  const type = changeType(repo, change);
  const branch = changeBranch(repo, change);
  const pr = planningComplete ? await prForBranch(repo, branch) : null;

  let apply = { total: prog.total, done: prog.done, source: "tasks.md" };
  if (planningComplete && prog.total > 0 && prog.done === 0) {
    const commits = await branchCommits(repo, branch);
    if (commits > 0) apply = { total: prog.total, done: null, commits, source: "commits" };
  }
  const applyDoneByTasks =
    (apply.source === "tasks.md" && apply.total > 0 && apply.done === apply.total) ||
    (apply.source === "commits" && !!pr);

  const ghApproved = pr && (pr.state === "MERGED" || pr.reviewDecision === "APPROVED");
  const reviewEntered = prog.reviewTaskDone === true || ghApproved || !!pr;
  let review = "none";
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

async function collect(repos) {
  const changes = [];
  for (const repo of repos) {
    for (const change of listChanges(repo)) {
      const status = await runStatus(repo, change);
      changes.push(await shapeChange(repo, change, status));
    }
  }
  return { generatedAt: new Date().toISOString(), repoCount: repos.length, changes };
}

// The board's full status payload for the current scan defaults.
async function getStatus(args = defaultArgs()) {
  const repos = discoverRepos(args);
  try {
    return await collect(repos);
  } catch (e) {
    return { error: String(e), changes: [] };
  }
}

// Guarded archive: only for a currently-discovered repo AND a real change.
// `archiver` is injectable so the guard is testable without shelling out.
async function archiveChange(args, repoPath, change, archiver = runArchive) {
  const repos = discoverRepos(args);
  const okRepo = repos.some((r) => path.resolve(r) === path.resolve(repoPath || ""));
  if (!okRepo || !change || !listChanges(repoPath).includes(change)) {
    return { ok: false, error: "unknown repo or change" };
  }
  return archiver(repoPath, change);
}

// Guarded read: only a path resolving inside a currently-discovered repo.
function readArtifact(args, fp) {
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

module.exports = {
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
  collect,
  getStatus,
  archiveChange,
  readArtifact,
};
