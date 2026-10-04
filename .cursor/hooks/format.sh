#!/usr/bin/env bash
# afterFileEdit hook: format the just-edited file with the project's Prettier.
# Fail-open by design — never block or error out an edit because of formatting.
set -uo pipefail

input="$(cat)"

# Extract the edited file path. Prefer jq; fall back to node so the hook works
# even when jq is not installed.
if command -v jq >/dev/null 2>&1; then
  file="$(printf '%s' "$input" | jq -r '.file_path // empty' 2>/dev/null)"
else
  file="$(printf '%s' "$input" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(String(JSON.parse(s).file_path||""))}catch{process.stdout.write("")}})' 2>/dev/null)"
fi

[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

# Only touch file types Prettier handles in this repo.
case "$file" in
  *.ts | *.tsx | *.js | *.jsx | *.mjs | *.cjs | *.json | *.jsonc | *.css | *.scss | *.md | *.mdx | *.html | *.yaml | *.yml) ;;
  *) exit 0 ;;
esac

# Use the repo-local Prettier; skip silently if deps aren't installed yet.
prettier_bin="./node_modules/.bin/prettier"
[ -x "$prettier_bin" ] || exit 0

# --ignore-unknown respects .prettierignore and unknown extensions.
"$prettier_bin" --write --ignore-unknown --log-level warn "$file" >/dev/null 2>&1 || exit 0

exit 0
