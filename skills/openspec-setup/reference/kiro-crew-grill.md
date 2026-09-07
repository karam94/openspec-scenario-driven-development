# Kiro Crew — wiring the interactive Grill

The Grill phase is an interactive interview: the Engineer stands up a live `product-manager` session with the `session_create` tool and the user answers each question. On Kiro Crew that needs **three** layers. Only the first ships in the package overlay; the other two are one-time host steps. `./scripts/setup-kiro-crew.sh` performs all three (and re-runs safely).

On a host without Kiro Crew (plain Kiro CLI, Claude, another OS) the `kirocrew` command does not resolve, the MCP servers never start, and the Engineer falls back to the schema's STOP-and-hand-off behaviour. None of this applies there.

## Contents

- [Layer 1 — adapter tools (pre-shipped)](#layer-1--adapter-tools-pre-shipped)
- [Layer 2 — gateway identity routing (run once)](#layer-2--gateway-identity-routing-run-once)
- [Layer 3 — session-control policy (run once)](#layer-3--session-control-policy-run-once)
- [Diagnosing a session_create refusal](#diagnosing-a-session_create-refusal)

## Layer 1 — adapter tools (pre-shipped)

The Kiro Engineer adapter (`.kiro/agents/engineer.json`) already declares the session tools:

- `@kirocrew-core` and the four `@kirocrew-dashboard` session tools (`session_create` / `session_send` / `session_read_message` / `session_stop`) are declared in the adapter's `tools` and `allowedTools` — the dashboard entries are listed individually rather than as a server wildcard, so the Engineer can reach only those session tools. `@kirocrew-core` provides `ask_question` (and the `spawn_run` the Engineer already uses for the independent review gate).
- Both servers are declared under `mcpServers` as `kirocrew mcp-core` / `kirocrew mcp-dashboard`, resolved from `PATH` so the config stays host-agnostic (no absolute paths). This assumes the `kirocrew` launcher is on `PATH`, which is the case on a KiroCrew install.

No action — this ships in the overlay.

## Layer 2 — gateway identity routing (run once)

Declaring the tools is not enough. `session_create` and the other session-control tools authorise on the *caller's* verified identity, which the gateway injects only for **routed** servers. On the kiro backend the session's runtime carries no session key of its own, so an unrouted server leaves the Engineer with no identity and the gateway refuses the call (`only a gateway-issued key counts`) — even though the tool is present in `allowedTools`. Route both servers and restart the gateway:

```bash
./scripts/setup-kiro-crew.sh   # routes the servers + exposes the opsx prompts (idempotent)
kirocrew restart               # load the new routing — the script reminds you
```

or manually:

```bash
kirocrew config set mcp_gateway.stub_servers '["kirocrew-core","kirocrew-dashboard"]'
kirocrew restart
```

Confirm with `kirocrew doctor`: the **Data Home** section must report `strict identity: ✅ routed`. Two gotchas: routing takes effect only after the restart, and identity is bound per session — an Engineer session started *before* the restart stays unidentified, so begin (or resume) the workflow in a session started *after* it.

## Layer 3 — session-control policy (run once)

Routing earns the caller an identity; the `agent.session_control` flag then decides whether the session-control tools are allowed at all. It defaults to `false`, so even with routing fixed `session_create` is refused — this time with `session control is disabled in config (agent.session_control)`. Enable it:

```bash
kirocrew config set agent.session_control true
```

Unlike routing, this is read live — no restart needed. `scripts/setup-kiro-crew.sh` sets it for you. Treat it as a security switch: it lets agents create and drive other sessions, so enable it deliberately.

## Diagnosing a session_create refusal

A `session_create` refusal during the Grill is a fixable setup gap, not an unavailable channel. The message names the missing layer:

- `only a gateway-issued key counts` (or `kirocrew doctor` shows the servers unrouted) → **Layer 2**: the servers are not routed. Fix by routing them + a `kirocrew restart`.
- `session control is disabled in config (agent.session_control)` → **Layer 3**: the policy flag is off. Fix with `kirocrew config set agent.session_control true` (read live, no restart).

Either way, `./scripts/setup-kiro-crew.sh` does both; run `kirocrew restart` if routing changed, then resume the workflow in a session started after the restart. Never degrade to a non-interactive Grill because setup was incomplete.
