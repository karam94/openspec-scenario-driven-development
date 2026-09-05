#!/usr/bin/env bash
#
# setup-kiro-crew.sh — Kiro Crew host wiring for the atdd-driven OpenSpec workflow.
#
# The interactive Grill (see skills/openspec-atdd) hands off to a live
# product-manager session via the session_create tool. That session-control
# tool authorises on the calling session's identity, which the gateway injects
# only for ROUTED MCP servers. The Engineer adapter already DECLARES the
# kirocrew-core / kirocrew-dashboard servers (Layer 1); this script performs
# Layer 2 — routing them so the gateway can identify the caller — and Layer 3 —
# enabling the agent.session_control policy that lets agents drive sessions — then
# exposes the generated opsx prompts to Kiro Crew's global prompt directory.
#
# Safe to re-run: routing is merged into any existing stub_servers, never
# overwritten. On a host without Kiro Crew it is a no-op. Run it once after
# extracting the overlay and running `openspec init`, then restart the gateway.

set -euo pipefail

if ! command -v kirocrew >/dev/null 2>&1; then
  echo "kirocrew not found on PATH — not a Kiro Crew host, nothing to do."
  exit 0
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Routing kirocrew-core + kirocrew-dashboard for session identity"
merged="$(kirocrew config get mcp_gateway.stub_servers 2>/dev/null | python3 -c '
import json, sys
raw = sys.stdin.read()
# Drop log lines so only the JSON value is parsed.
text = "\n".join(l for l in raw.splitlines() if "WARNING" not in l and "Superseded" not in l).strip()
try:
    current = json.loads(text) if text else []
    if not isinstance(current, list):
        current = []
except Exception:
    current = []
required = ["kirocrew-core", "kirocrew-dashboard"]
# Preserve order and any pre-existing entries; de-duplicate.
print(json.dumps(list(dict.fromkeys([*current, *required]))))
')"
kirocrew config set "mcp_gateway.stub_servers" "$merged"

echo "==> Enabling session control (agent.session_control)"
# Security switch (default false, read live): lets agents create/drive sessions; the interactive Grill needs it.
kirocrew config set agent.session_control true

# Expose the generated Kiro prompts to Kiro Crew's global prompt directory.
prompts_glob="$REPO_ROOT/.kiro/prompts/opsx-"*.prompt.md
if compgen -G "$prompts_glob" >/dev/null 2>&1; then
  echo "==> Exposing opsx prompts to \$HOME/.kiro/prompts"
  mkdir -p "$HOME/.kiro/prompts"
  cp -f $prompts_glob "$HOME/.kiro/prompts/"
else
  echo "==> No .kiro/prompts/opsx-*.prompt.md found — run 'openspec init' / 'openspec update' first (skipping prompt exposure)."
fi

cat <<'EOF'

Done — session control is enabled (read live) and the servers are routed. One
manual step remains: restart the gateway so the routing loads (session control
needs no restart):

    kirocrew restart

Then confirm:

    kirocrew doctor    # Data Home → "strict identity: ✅ routed"

Identity is bound per session, so start (or resume) the OpenSpec workflow in a
session created AFTER the restart — a session opened before it stays unidentified.
EOF
