#!/usr/bin/env node
/*
 * OpenSpec Board — live multi-repo dashboard for atdd-driven changes.
 *
 * Zero dependencies (node:http + node:child_process + node:fs only). Serves a
 * single-page board that polls /api/status every 15s. The board itself is a
 * browser page and cannot exec the CLI — this server does that for it.
 *
 * Usage:
 *   node board/server.js [--port 7788] [--root ~/Code] [--depth 4] [--no-open]
 *   node board/server.js --repo /path/a --repo /path/b   (explicit override)
 *
 * On start it opens the board in your default browser (--no-open to disable).
 * If the port is already held by a stale instance, it frees it and rebinds —
 * so you never have to lsof/kill between restarts.
 *
 * With no flags it RECURSIVELY scans ~/Code (depth-capped, pruning node_modules
 * /.git/archives) for every openspec/changes directory — so any active OpenSpec
 * change under there shows up automatically, no per-repo config.
 *
 * --root overrides the scan root; --repo (repeatable) bypasses scanning entirely
 * and uses exactly those repos.
 *
 * Binds to 127.0.0.1 only.
 */

const http = require("node:http");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const PHASES = ["grill", "proposal", "specs", "design", "tasks"];

// Directories never worth descending into — huge and never hold a real change.
const PRUNE = new Set([
  "node_modules", ".git", ".hg", ".svn", "dist", "build", "out", "target",
  ".venv", "venv", "__pycache__", ".cache", ".next", ".turbo", "coverage",
  "vendor", ".idea", ".vscode", "Pods", "DerivedData",
]);
const DEFAULT_DEPTH = 4;

function parseArgs(argv) {
  const out = { port: 7788, repos: [], root: path.join(os.homedir(), "Code"), depth: DEFAULT_DEPTH, open: true };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port") out.port = parseInt(argv[++i], 10) || out.port;
    else if (a === "--root") out.root = path.resolve(argv[++i]);
    else if (a === "--depth") out.depth = parseInt(argv[++i], 10) || out.depth;
    else if (a === "--repo") out.repos.push(path.resolve(argv[++i]));
    else if (a === "--repos") out.repos.push(...argv[++i].split(",").map((s) => path.resolve(s.trim())));
    else if (a === "--no-open") out.open = false;
  }
  return out;
}

// Open a URL in the default browser (best-effort, cross-platform). Never throws.
function openBrowser(url) {
  const cmd = process.platform === "darwin" ? "open"
    : process.platform === "win32" ? "cmd" : "xdg-open";
  const cmdArgs = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    const child = execFile(cmd, cmdArgs, () => {});
    child.on("error", () => {}); // no browser / headless — ignore
  } catch {
    /* ignore */
  }
}

// A repo is any directory containing openspec/changes.
function isRepo(dir) {
  try {
    return fs.statSync(path.join(dir, "openspec", "changes")).isDirectory();
  } catch {
    return false;
  }
}

// Recursively find every dir under `root` that contains openspec/changes.
// Depth-capped and prune-listed so it never crawls caches / node_modules / VM
// images. Once a repo is found we do NOT descend further into it (a change dir
// won't contain another repo). Symlinks are not followed.
function scanRoot(root, maxDepth) {
  const found = [];
  function walk(dir, depth) {
    if (depth > maxDepth) return;
    if (isRepo(dir)) { found.push(dir); return; } // don't recurse into a repo
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
  if (args.repos.length) return args.repos.filter(isRepo); // explicit override
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

// Archive a change via the OpenSpec CLI (moves it to changes/archive/). This is
// the proper "retire" — reversible on disk, not a destructive delete. --skip-specs
// avoids a spec-merge prompt for changes that don't update main specs; --yes makes
// it non-interactive. Returns {ok, error}.
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

// Count "- [ ]" / "- [x]" checkboxes in tasks.md for apply progress.
function taskProgress(repo, change) {
  const p = path.join(repo, "openspec", "changes", change, "tasks.md");
  try {
    const text = fs.readFileSync(p, "utf8");
    const all = text.match(/^\s*-\s*\[[ xX]\]/gm) || [];
    const done = text.match(/^\s*-\s*\[[xX]\]/gm) || [];
    return { total: all.length, done: done.length };
  } catch {
    return { total: 0, done: 0 };
  }
}

// Classify a change as "refactor" or "feature".
// Priority: (1) the authoritative `Change type: REFACTOR|FEATURE` line the
// atdd-driven schema writes into proposal.md; (2) failing that, the proposal's
// CONTENT — a behaviour-preserving change (refactor) says so in plain language
// and adds no new capability; (3) failing even that, the change-name prefix.
function changeType(repo, change) {
  const p = path.join(repo, "openspec", "changes", change, "proposal.md");
  let text = "";
  try {
    text = fs.readFileSync(p, "utf8");
  } catch {
    return /^refactor[-/]/i.test(change) ? "refactor" : "feature"; // no proposal yet
  }

  // (1) Authoritative classification line.
  if (/change type:\s*refactor/i.test(text)) return "refactor";
  if (/change type:\s*feature/i.test(text)) return "feature";

  // (2) Content detection. Behaviour-preserving language is the refactor tell.
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
  // A feature adds a NEW capability with real content; a refactor's "New
  // Capabilities" section is empty/None (or absent).
  const newCapBlock = (text.match(/###\s*New Capabilities([\s\S]*?)(?=\n##|\n###|$)/i) || [])[1] || "";
  const addsNewCapability = /^\s*-\s+\S/m.test(newCapBlock.replace(/<!--[\s\S]*?-->/g, ""));

  if (hasRefactorLang && !addsNewCapability) return "refactor";
  if (addsNewCapability) return "feature";

  // (3) Name-prefix fallback.
  return /^refactor[-/]/i.test(change) ? "refactor" : "feature";
}

// Best-effort branch name for a change: the branch recorded in tasks.md, else the
// conventional <type>/<change-without-prefix>. Used to resolve the PR.
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

// Resolve an open/merged PR URL for a change's branch via gh (best-effort, cached
// per collect() cycle). Returns a URL string or null. gh missing / no PR → null.
function prForBranch(repo, branch) {
  return new Promise((resolve) => {
    if (!branch) return resolve(null);
    execFile(
      "gh",
      ["pr", "list", "--head", branch, "--state", "all", "--json", "url,state", "--limit", "1"],
      { cwd: repo, timeout: 8000 },
      (err, stdout) => {
        if (err || !stdout) return resolve(null);
        try {
          const arr = JSON.parse(stdout);
          resolve(arr[0] ? { url: arr[0].url, state: arr[0].state } : null);
        } catch {
          resolve(null);
        }
      }
    );
  });
}

// Shape a status JSON into the board's per-change model.
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
  // Mark the FIRST applicable, not-done phase as in-progress (gets a spinner).
  const nextIdx = phases.findIndex((p) => p.applicable && !p.done);
  if (nextIdx !== -1) phases[nextIdx].inProgress = true;

  const prog = taskProgress(repo, change);
  const planningComplete = !!(status && status.isPlanningComplete);
  const applying = planningComplete && prog.total > 0 && prog.done < prog.total;
  const complete = !!(status && status.isComplete) && prog.total > 0 && prog.done === prog.total;

  const type = changeType(repo, change);
  const branch = changeBranch(repo, change);
  // Only look up a PR once apply has started (a branch exists / work is underway).
  const pr = planningComplete ? await prForBranch(repo, branch) : null;

  return {
    change,
    repo: path.basename(repo),
    repoPath: repo,
    schema: (status && status.schemaName) || "unknown",
    type,
    phases,
    apply: prog,
    applying,
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

const args = parseArgs(process.argv);
const PAGE = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");

const server = http.createServer(async (req, res) => {
  if (req.url.startsWith("/api/status")) {
    const repos = discoverRepos(args);
    let payload;
    try {
      payload = await collect(repos);
    } catch (e) {
      payload = { error: String(e), changes: [] };
    }
    res.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    return res.end(JSON.stringify(payload));
  }
  if (req.method === "POST" && req.url.startsWith("/api/archive")) {
    let body = "";
    req.on("data", (c) => { body += c; if (body.length > 4096) req.destroy(); });
    req.on("end", async () => {
      let repoPath, change;
      try {
        ({ repoPath, change } = JSON.parse(body || "{}"));
      } catch {
        res.writeHead(400, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "bad JSON body" }));
      }
      // Only archive within a currently-discovered repo, and only a real change.
      const repos = discoverRepos(args);
      const okRepo = repos.some((r) => path.resolve(r) === path.resolve(repoPath || ""));
      if (!okRepo || !change || !listChanges(repoPath).includes(change)) {
        res.writeHead(403, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: "unknown repo or change" }));
      }
      const result = await runArchive(repoPath, change);
      res.writeHead(result.ok ? 200 : 500, { "content-type": "application/json" });
      res.end(JSON.stringify(result));
    });
    return;
  }
  if (req.url.startsWith("/api/file")) {
    // Serve a change artifact file's contents (read-only, scoped to a discovered repo).
    const u = new URL(req.url, "http://localhost");
    const fp = u.searchParams.get("path") || "";
    const repos = discoverRepos(args);
    const allowed = repos.some((r) => path.resolve(fp).startsWith(path.resolve(r) + path.sep));
    if (!allowed) {
      res.writeHead(403, { "content-type": "text/plain" });
      return res.end("path outside discovered repos");
    }
    try {
      const body = fs.readFileSync(fp, "utf8");
      res.writeHead(200, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
      return res.end(body);
    } catch {
      res.writeHead(404, { "content-type": "text/plain" });
      return res.end("not found");
    }
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(PAGE);
});

function start() {
  const url = `http://127.0.0.1:${args.port}`;
  const repos = discoverRepos(args);
  const src = args.repos.length ? "explicit --repo list" : `recursive scan of ${args.root} (depth ${args.depth})`;
  console.log(`OpenSpec Board → ${url}`);
  console.log(`Source: ${src}`);
  console.log(`Watching ${repos.length} repo(s):`);
  repos.forEach((r) => console.log(`  • ${r}`));
  if (!repos.length) console.log(`  (none found — check --root, or pass --repo <path>)`);
  if (args.open) {
    console.log("Opening in your browser… (pass --no-open to disable)");
    openBrowser(url);
  }
}

// The whole point of this block: never make the user run lsof. If the port is
// already held by a stale instance of THIS server, kill it and rebind; only if
// that fails do we fall to the next free port. So a plain restart always works.
let _retriedAfterKill = false;
server.on("error", (err) => {
  if (err.code !== "EADDRINUSE") throw err;
  if (!_retriedAfterKill) {
    _retriedAfterKill = true;
    console.log(`Port ${args.port} busy — freeing the stale listener and rebinding…`);
    // Kill whatever holds the port (best-effort; macOS/Linux). Then retry once.
    execFile("bash", ["-c", `lsof -ti tcp:${args.port} | xargs kill 2>/dev/null`], () => {
      setTimeout(() => server.listen(args.port, "127.0.0.1"), 400);
    });
  } else {
    // Couldn't free it (permissions, foreign process) — use the next port.
    console.log(`Port ${args.port} still busy — trying ${args.port + 1}.`);
    args.port += 1;
    setTimeout(() => server.listen(args.port, "127.0.0.1"), 100);
  }
});

server.on("listening", start);
server.listen(args.port, "127.0.0.1");
