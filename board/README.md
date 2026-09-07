# OpenSpec Board

A live, multi-repo dashboard for atdd-driven OpenSpec changes. It renders every
active change across your repos as a phase-chain diagram
(`grill → proposal → specs → design → tasks → apply`), auto-refreshes every 15s,
and lets you archive a change from the UI.

![phase chain per change, coloured by state, with type badge, spinner, PR link, and archive button]

## Run it

```bash
node board/server.js
```

It recursively scans `~/Code` for every `openspec/changes/` directory, starts a
local server on `http://127.0.0.1:7788`, and opens it in your browser.

> ⚠️ **Must be run via the server** — don't open `index.html` directly. The page
> needs the server to run the `openspec` CLI for it; a `file://` page can't, and
> shows a message telling you to run the server.

### Options

| Flag | Default | Meaning |
|------|---------|---------|
| `--root <dir>` | `~/Code` | Root to recursively scan for repos |
| `--depth <n>` | `4` | Max scan depth |
| `--repo <path>` | — | Use this repo explicitly (repeatable); bypasses scanning |
| `--repos a,b` | — | Comma-separated explicit repos |
| `--port <n>` | `7788` | Port to serve on |
| `--no-open` | — | Don't auto-open the browser |

If the port is already held by a stale instance, the server frees it and
rebinds — no need to `lsof`/kill between restarts.

## What it shows, per change

- **Type badge** — REFACTOR or FEATURE, from the proposal's `Change type:` line,
  else behaviour-preserving language in the proposal, else the name prefix.
- **Phase chain** — each artifact node is green (done), spinner (in progress), or
  dashed (pending). Click a done node to read its `.md` file inline.
- **Apply progress** — `done/total` checkbox count from `tasks.md`, with a bar.
- **PR link** — the open/merged PR for the change's branch, via `gh` (if any).
- **Archive** — runs `openspec archive <change>` (moves it to `changes/archive/`);
  the row greys out and disappears.

## How state is derived

- **Phases:** `openspec status --change <name> --json` → which artifact files exist.
- **Apply progress:** checkbox tally (`- [ ]` / `- [x]`) in the change's `tasks.md`.
- **PR:** `gh pr list --head <branch>` for the branch recorded in `tasks.md`.
- **Type:** proposal `Change type:` line → proposal content → name prefix.

## Requirements

- Node.js (any recent version; zero npm dependencies — `node:http` etc. only)
- `openspec` on PATH
- `gh` on PATH (optional — only for PR links)

## Endpoints

- `GET /` — the board page
- `GET /api/status` — JSON state of all discovered changes
- `GET /api/file?path=<abs>` — a change artifact file's contents (scoped to discovered repos)
- `POST /api/archive` `{repoPath, change}` — archive a change via the CLI
