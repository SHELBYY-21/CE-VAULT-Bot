# CE VAULT Autopilot (Cursor SDK)

Launch Cursor cloud agents from your laptop or CI to keep CE VAULT moving — PR triage, CI fixes, slip UI polish, hosting hardening — without babysitting each run in the IDE.

Uses [`@cursor/sdk`](https://cursor.com/docs/sdk/typescript). Cloud runs keep going after your terminal exits; filter Agents by **Source → SDK** to find them.

## Setup

1. Create an API key: [Cursor Dashboard → API Keys](https://cursor.com/dashboard/api)
2. Export it (user or service-account key; Team Admin keys are not supported yet):

```bash
export CURSOR_API_KEY="crsr_..."
```

Optional overrides:

| Env | Default |
| --- | --- |
| `CURSOR_AUTOPILOT_REPO_URL` | `https://github.com/SHELBYY-21/CE-VAULT-Bot` |
| `CURSOR_AUTOPILOT_STARTING_REF` | `main` |
| `CURSOR_AUTOPILOT_MODEL` | `composer-2.5` |

## Commands

```bash
# List playbooks
npm run autopilot -- list

# Preview prompt (no key required)
npm run autopilot -- triage --dry-run

# Launch cloud agent (opens draft PR when the run finishes)
npm run autopilot -- triage
npm run autopilot -- ci-fix --wait
npm run autopilot -- slip-ui
npm run autopilot -- hosting
npm run autopilot -- bot-smoke

# Custom task
npm run autopilot -- freeform -- "Tighten profit calc edge cases and add vitest coverage"

# Local agent against this working tree
npm run autopilot -- freeform --local --wait -- "Summarize AGENTS.md in 5 bullets"
```

Flags: `--local`, `--dry-run`, `--wait`, `--no-pr`, `--model <id>`, `--ref <ref>`, `--name <name>`.

After a cloud launch you get an agent URL:

`https://cursor.com/agents/<bc-…>`

## Playbooks

| Id | What it does |
| --- | --- |
| `triage` | Review open PRs, close clearly superseded work, prep the best green draft |
| `ci-fix` | Reproduce and fix the highest-impact CI failure (ignores deprecated Vercel checks) |
| `slip-ui` | Polish Telegram interactive slip UI + dashboard preview + tests |
| `hosting` | Harden non-Vercel hosting docs / Actions / Docker paths |
| `bot-smoke` | Strengthen webhook dry-run / walkthrough coverage |
| `freeform` | Your prompt after `--` |

Agents are instructed to use branch names `Cursor/razen<descriptive>-d734`, prefer draft PRs, and avoid Vercel.

## GitHub Actions (manual)

Workflow: `.github/workflows/autopilot.yml` → **Actions → Autopilot → Run workflow**.

Repository secret required:

- `CURSOR_API_KEY`

Optional inputs: playbook, extra prompt, model, starting ref, wait.

Billing follows normal Cursor SDK / Cloud Agent usage (tagged SDK in the usage dashboard).

## Safety

- Prefer draft PRs; review before merge.
- Autopilot does not deploy production or rotate secrets.
- Do not put long-lived secrets into playbook text — use repo secrets / cloud env only when needed.
- Cloud `autoCreatePR` still depends on GitHub integration permissions; you may get a branch without a PR if those are missing.
