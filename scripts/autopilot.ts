/**
 * CE VAULT Autopilot — launch Cursor cloud (or local) agents via @cursor/sdk.
 *
 * Usage:
 *   CURSOR_API_KEY=... npm run autopilot -- triage
 *   CURSOR_API_KEY=... npm run autopilot -- ci-fix --wait
 *   CURSOR_API_KEY=... npm run autopilot -- freeform -- "Add regression tests for fees.ts"
 *   npm run autopilot -- list
 *   npm run autopilot -- triage --dry-run
 *
 * Docs: docs/AUTOPILOT.md
 */

import { Agent, type SDKMessage } from "@cursor/sdk";

const REPO_URL =
  process.env.CURSOR_AUTOPILOT_REPO_URL ??
  "https://github.com/SHELBYY-21/CE-VAULT-Bot";
const STARTING_REF = process.env.CURSOR_AUTOPILOT_STARTING_REF ?? "main";
const DEFAULT_MODEL = process.env.CURSOR_AUTOPILOT_MODEL ?? "composer-2.5";

function isFeatureUnavailable(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /feature_unavailable|403/i.test(msg);
}

type Playbook = {
  id: string;
  title: string;
  autoCreatePR: boolean;
  prompt: string;
};

const PLAYBOOKS: Playbook[] = [
  {
    id: "triage",
    title: "PR triage & cleanup",
    autoCreatePR: true,
    prompt: `You are Autopilot for CE VAULT (USDT⇄THB arbitrage ledger; Next.js + Firebase; Telegram bot at app/api/telegram/webhook).

Task: triage open pull requests on this repo.

1. List open PRs with gh (draft vs ready, CI status, mergeability, overlap with main).
2. Identify superseded / already-merged-on-main work (especially Vision+/pin if already on main) and close those with a short comment explaining why — only when clearly redundant.
3. For the highest-value open draft that is green and mergeable (likely interactive slip UI / hosting docs), prepare it: rebase onto main if needed, fix tiny CI/lint issues, leave a concise summary of what remains before merge.
4. Do NOT merge unless CI is green and the change is clearly safe; prefer opening/updating a small follow-up PR on branch Cursor/razen*-d734.
5. Commit, push, and open/update a draft PR summarizing triage actions and recommendations.

Constraints from AGENTS.md:
- Firebase/Firestore backend (not runtime Supabase).
- Do not use Vercel; hosting is GitHub Actions + Cloudflare tunnel / Docker / App Hosting.
- Branch names must match Cursor/razen<descriptive>-d734 (lowercase).
- Keep ESLint on v9; run typecheck/lint/test before finishing.`,
  },
  {
    id: "ci-fix",
    title: "Fix failing CI on main or open PRs",
    autoCreatePR: true,
    prompt: `You are Autopilot for CE VAULT.

Task: find and fix the most important CI failure blocking the team.

1. Check recent CI on main and open PRs (gh run list / pr checks).
2. Reproduce locally: npm ci, npm run typecheck, npm run lint, npm test, npm run build.
3. Fix the root cause with a minimal diff. Skip ffmpeg/sticker ffprobe failures when ffmpeg is missing (tests should skip gracefully).
4. Ignore failing Vercel status checks — Vercel is deprecated; document if still required in branch protection.
5. Push on Cursor/razen*-d734 and open/update a draft PR with the fix.

Read AGENTS.md first.`,
  },
  {
    id: "slip-ui",
    title: "Interactive slip UI polish",
    autoCreatePR: true,
    prompt: `You are Autopilot for CE VAULT.

Task: polish the Telegram interactive slip UI (Received → Checking → Complete) without breaking the webhook flow.

Focus areas:
- src/lib/botUi.ts helpers: interactiveSlipReceived / Checking / Complete
- app/api/telegram/webhook/route.ts beginSlipInteractive / finishSlipInteractive
- Dashboard preview in src/components/brand/InteractiveCards.tsx
- Unit tests in src/lib/__tests__/interactive-slip-ui.test.ts
- Demo script scripts/demo-interactive-slip.ts (npm run demo:slip-ui)

Improve UX copy, progress phases, button callbacks, and edge cases (cancel, OCR fail, pin match). Keep brand tone consistent. Run typecheck/lint/test. Branch Cursor/razen*-d734, draft PR.

Do not add Vercel. Firebase only.`,
  },
  {
    id: "hosting",
    title: "Non-Vercel hosting hardening",
    autoCreatePR: true,
    prompt: `You are Autopilot for CE VAULT.

Task: harden the non-Vercel hosting path documented in docs/HOSTING.md.

1. Ensure README/AGENTS/CI never require Vercel; vercel.json must not exist.
2. Verify dashboard-24h.yml / bot-24h.yml / Dockerfile / docker-compose.yml / apphosting.yaml stay coherent.
3. Improve docs or CI "hosting" job if gaps remain (clear operator steps, secret names, tunnel notes).
4. Small, focused PR on Cursor/razen*-d734. Run typecheck/lint/test if code changed.`,
  },
  {
    id: "bot-smoke",
    title: "Bot webhook smoke & walkthrough",
    autoCreatePR: true,
    prompt: `You are Autopilot for CE VAULT.

Task: strengthen Telegram webhook smoke coverage that works when api.telegram.org is blocked.

1. Review TELEGRAM_DRY_RUN in src/lib/telegram.ts and scripts/e2e-walkthrough.mjs (npm run test:walkthrough).
2. Extend coverage for critical commands: /start, /setrate, /pin, /today, photo slip path (dry-run), /tools.
3. Keep secrets optional in local/dev (API_SECRET unset skips webhook secret).
4. Add or tighten tests; document how to run. Branch Cursor/razen*-d734, draft PR.
5. Run typecheck/lint/test.`,
  },
  {
    id: "freeform",
    title: "Custom prompt (pass after --)",
    autoCreatePR: true,
    prompt: "", // filled from CLI
  },
];

function usage(): never {
  const ids = PLAYBOOKS.map((p) => `  ${p.id.padEnd(12)} ${p.title}`).join("\n");
  console.log(`CE VAULT Autopilot (Cursor SDK)

Usage:
  npm run autopilot -- <playbook> [options] [-- <extra prompt>]
  npm run autopilot -- list

Playbooks:
${ids}

Options:
  --local          Run local agent against this working tree (default: cloud)
  --dry-run        Print the prompt and exit (no API key needed)
  --wait           Wait for the run to finish and print PR URL if any
  --no-pr          Do not set autoCreatePR (cloud only)
  --model <id>     Model id (default: ${DEFAULT_MODEL})
  --ref <ref>      Cloud startingRef (default: ${STARTING_REF})
  --name <name>    Agent display name

Env:
  CURSOR_API_KEY                 required unless --dry-run
  CURSOR_AUTOPILOT_REPO_URL      default ${REPO_URL}
  CURSOR_AUTOPILOT_STARTING_REF  default ${STARTING_REF}
  CURSOR_AUTOPILOT_MODEL         default ${DEFAULT_MODEL}
`);
  process.exit(1);
}

function parseArgs(argv: string[]) {
  const args = [...argv];
  const opts = {
    local: false,
    dryRun: false,
    wait: false,
    noPr: false,
    model: DEFAULT_MODEL,
    ref: STARTING_REF,
    name: "" as string,
    playbookId: "" as string,
    extra: "" as string,
  };

  if (args[0] === "list") {
    for (const p of PLAYBOOKS) {
      console.log(`${p.id}\t${p.title}`);
    }
    process.exit(0);
  }

  opts.playbookId = args.shift() ?? "";
  if (!opts.playbookId) usage();

  while (args.length) {
    const a = args.shift()!;
    if (a === "--") {
      opts.extra = args.join(" ").trim();
      break;
    }
    if (a === "--local") opts.local = true;
    else if (a === "--dry-run") opts.dryRun = true;
    else if (a === "--wait") opts.wait = true;
    else if (a === "--no-pr") opts.noPr = true;
    else if (a === "--model") opts.model = args.shift() ?? opts.model;
    else if (a === "--ref") opts.ref = args.shift() ?? opts.ref;
    else if (a === "--name") opts.name = args.shift() ?? "";
    else if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      usage();
    } else {
      // bare remainder treated as freeform extra
      opts.extra = [a, ...args].join(" ").trim();
      break;
    }
  }

  return opts;
}

function resolvePlaybook(id: string, extra: string): Playbook {
  const base = PLAYBOOKS.find((p) => p.id === id);
  if (!base) {
    console.error(`Unknown playbook: ${id}`);
    usage();
  }
  if (id === "freeform") {
    if (!extra) {
      console.error("freeform requires a prompt after --");
      usage();
    }
    return {
      ...base,
      prompt: `You are Autopilot for CE VAULT (Next.js + Firebase + Telegram webhook). Read AGENTS.md.

Branch naming: Cursor/razen<descriptive>-d734 (lowercase). Prefer draft PRs. Do not use Vercel.
Run typecheck/lint/test before finishing.

Task:
${extra}`,
    };
  }
  if (extra) {
    return {
      ...base,
      prompt: `${base.prompt}

Additional instructions from operator:
${extra}`,
    };
  }
  return base;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const playbook = resolvePlaybook(opts.playbookId, opts.extra);
  const autoCreatePR = opts.local ? false : playbook.autoCreatePR && !opts.noPr;
  const agentName =
    opts.name || `CE VAULT Autopilot · ${playbook.id}`;

  console.log(`Playbook: ${playbook.id} — ${playbook.title}`);
  console.log(`Runtime:  ${opts.local ? "local" : "cloud"}`);
  console.log(`Model:    ${opts.model}`);
  if (!opts.local) {
    console.log(`Repo:     ${REPO_URL} @ ${opts.ref}`);
    console.log(`autoCreatePR: ${autoCreatePR}`);
  }

  if (opts.dryRun) {
    console.log("\n--- prompt (dry-run) ---\n");
    console.log(playbook.prompt);
    console.log("\n--- end ---\n");
    return;
  }

  const apiKey = process.env.CURSOR_API_KEY;
  if (!apiKey) {
    console.error(
      "Missing CURSOR_API_KEY. Create one at https://cursor.com/dashboard/api\n" +
        "Or pass --dry-run to preview the prompt.",
    );
    process.exit(1);
  }

  async function createAgent(withMetadata: boolean) {
    return Agent.create({
      apiKey,
      name: agentName,
      model: { id: opts.model },
      ...(opts.local
        ? { local: { cwd: process.cwd() } }
        : {
            cloud: {
              repos: [{ url: REPO_URL, startingRef: opts.ref }],
              autoCreatePR,
              ...(withMetadata
                ? {
                    metadata: {
                      product: "ce-vault",
                      playbook: playbook.id,
                      source: "npm-run-autopilot",
                    },
                  }
                : {}),
            },
          }),
    });
  }

  let agent;
  try {
    agent = await createAgent(!opts.local);
  } catch (err) {
    if (!opts.local && isFeatureUnavailable(err)) {
      console.warn("Metadata not available for this API key; retrying without it.");
      agent = await createAgent(false);
    } else {
      throw err;
    }
  }

  console.log(`Agent:    ${agent.agentId}`);
  if (!opts.local) {
    console.log(`URL:      https://cursor.com/agents/${agent.agentId}`);
    console.log(
      "(Filter Agents list by Source → SDK if missing from default view)",
    );
  }

  const run = await agent.send(playbook.prompt);
  console.log(`Run:      ${run.id}`);

  if (!opts.wait) {
    if (opts.local) {
      // Local process must stay alive for the agent loop.
      const result = await run.wait();
      console.log(`Status:   ${result.status}`);
      return;
    }
    console.log(
      "Cloud agent is running. Watch progress in the Agents UI (or re-run with --wait).",
    );
    return;
  }

  for await (const event of run.stream()) {
    logStreamEvent(event);
  }
  process.stdout.write("\n");

  const result = await run.wait();
  console.log(`Status:   ${result.status}`);
  if (result.error?.message) console.error(`Error:    ${result.error.message}`);
  const branchInfo = result.git?.branches?.[0];
  if (branchInfo?.prUrl) console.log(`PR:       ${branchInfo.prUrl}`);
  if (branchInfo?.branch) console.log(`Branch:   ${branchInfo.branch}`);
}

function logStreamEvent(event: SDKMessage): void {
  if (event.type === "status") {
    process.stdout.write(`\n[${event.status}]`);
    return;
  }
  if (event.type === "tool_call") {
    process.stdout.write(`\n· ${event.name} (${event.status})`);
    return;
  }
  if (event.type === "assistant") {
    const texts = event.message.content
      .filter((b): b is { type: "text"; text: string } => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (texts.trim()) process.stdout.write(".");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
