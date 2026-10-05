#!/usr/bin/env bash
set -euo pipefail

agent="${1:-codex}"
if [ "$#" -gt 0 ]; then
  shift
fi

case "$agent" in
  codex|claude|claude-code|aider|goose|copilot|copilot-cli|cursor-agent|cline|openclaw)
    ;;
  *)
    echo "Unsupported agent: $agent" >&2
    echo "Allowed: codex, claude, claude-code, aider, goose, copilot, copilot-cli, cursor-agent, cline, openclaw" >&2
    exit 64
    ;;
esac

if [ "$(uname -s)" != "Linux" ]; then
  echo "Grith supervision is currently Linux-only. Refusing unsupervised fallback." >&2
  exit 69
fi

if ! command -v grith >/dev/null 2>&1; then
  cat >&2 <<'EOF'
Grith is not installed. Refusing to launch the agent unsupervised.
Install and initialize it explicitly:
  curl -fsSL https://grith.ai/install | sh
  grith init
Then rerun this wrapper.
EOF
  exit 69
fi

if ! command -v "$agent" >/dev/null 2>&1; then
  echo "Agent command not found on PATH: $agent" >&2
  exit 69
fi

if [ ! -f "${HOME}/.config/grith/config.toml" ]; then
  cat >&2 <<'EOF'
Grith is installed but not initialized. Refusing to generate or overwrite config automatically.
Run once:
  grith init
Then inspect:
  grith config
EOF
  exit 78
fi

# Fail closed by delegating launch to Grith. --workspace-only denies access
# outside this repository/worktree rather than merely scoring it.
exec grith exec --workspace-only "$agent" "$@"
