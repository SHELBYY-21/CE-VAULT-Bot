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

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
repo_root="$(git -C "${script_dir}/.." rev-parse --show-toplevel 2>/dev/null || true)"

if [ -z "$repo_root" ] || [ "$repo_root" = "/" ] || [ "$repo_root" = "$HOME" ]; then
  echo "Unable to resolve a safe CE VAULT repository root. Refusing launch." >&2
  exit 78
fi

if [ ! -f "$repo_root/ops/agent-control-policy.json" ]; then
  echo "Agent control policy not found at repository root. Refusing launch." >&2
  exit 78
fi

cd "$repo_root"

# Fail closed by launching from the canonical repository/worktree root.
# --workspace-only denies access outside this explicit workspace boundary.
exec grith exec --workspace-only "$agent" "$@"
