import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'appsrc');
const serverPath = path.join(appRoot, 'server', 'gatekeeper.mjs');
const runtimePath = path.join(appRoot, 'server', 'gatekeeper-runtime.mjs');
const testsPath = path.join(appRoot, 'tests', 'gatekeeper.test.mjs');
const repoPath = path.join(appRoot, 'server', 'repositories', 'supabase.mjs');
const indexPath = path.join(appRoot, 'server', 'index.mjs');

mkdirSync(path.dirname(serverPath), { recursive: true });
mkdirSync(path.dirname(testsPath), { recursive: true });

function replaceOnce(source, needle, replacement, errorCode) {
  if (!source.includes(needle)) throw new Error(errorCode);
  return source.replace(needle, replacement);
}

// ---------------------------------------------------------------------------
// CE VAULT GATEKEEPER — MVP skeleton (Empire Command Architecture)
// Invariants (docs/GATEKEEPER.md):
//   1. Audit record is written to Supabase BEFORE any action is performed.
//   2. Exactly one approval per (kind, target); retries are idempotent.
//   3. Only allowlisted Telegram user IDs may approve (env CE_GATEKEEPER_TELEGRAM_IDS).
//   4. While the lock is engaged, every approval command is refused.
//   5. Failure is terminal for that approval: recorded, never auto-retried.
//   6. The module is INERT until CE_GATEKEEPER_TELEGRAM_IDS is configured.
// No money movement, no destructive production change is ever executed here.
// ---------------------------------------------------------------------------

const moduleSource = String.raw`// CE VAULT GATEKEEPER — MVP skeleton (docs/GATEKEEPER.md)
// Pure, dependency-injected logic. No direct network/database access:
// the runtime supplies adapters (repository, github, telegram, clock).

export const GATE_COMMANDS = Object.freeze({
  APPROVE: 'approve',
  LOCK: 'lock',
  UNLOCK: 'unlock',
  STATUS: 'status',
});

export const GATE_KINDS = Object.freeze({
  PR: 'pr',
  MIGRATION: 'migration',
  SETTLE: 'settle',
});

const KIND_PATTERN = /^[A-Za-z0-9._-]{1,64}$/;

export function parseApprovalCommand(rawText) {
  const text = String(rawText == null ? '' : rawText).trim();
  if (text === '/lock') return { ok: true, command: GATE_COMMANDS.LOCK };
  if (text === '/unlock') return { ok: true, command: GATE_COMMANDS.UNLOCK };
  if (text === '/gatestatus') return { ok: true, command: GATE_COMMANDS.STATUS };
  const explicit = /^\/approve\s+(migration|settle)\s+([A-Za-z0-9._-]{1,64})$/i.exec(text);
  if (explicit) {
    return { ok: true, command: GATE_COMMANDS.APPROVE, kind: explicit[1].toLowerCase(), target: explicit[2] };
  }
  const pr = /^\/approve\s+#?(\d{1,6})$/.exec(text);
  if (pr) {
    const number = Number(pr[1]);
    if (number >= 1 && number <= 999999) {
      return { ok: true, command: GATE_COMMANDS.APPROVE, kind: GATE_KINDS.PR, target: pr[1] };
    }
  }
  return { ok: false, reason: 'UNRECOGNIZED_COMMAND' };
}

export function parseApproverAllowlist(rawIds) {
  return String(rawIds == null ? '' : rawIds)
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => /^\d{1,19}$/.test(entry))
    .map(Number);
}

export function isAuthorizedApprover(telegramUserId, allowlist) {
  if (!Array.isArray(allowlist) || allowlist.length === 0) return false;
  const raw = String(telegramUserId == null ? '' : telegramUserId).trim();
  if (!/^\d{1,19}$/.test(raw)) return false;
  const id = Number(raw);
  return Number.isSafeInteger(id) && allowlist.includes(id);
}

function approvalKey(kind, target) {
  if (!Object.values(GATE_KINDS).includes(kind)) throw new Error('INVALID_KIND');
  if (!KIND_PATTERN.test(String(target || ''))) throw new Error('INVALID_TARGET');
  return kind + ':' + target;
}

function reply(code, detail) {
  return { ok: false, code: code, detail: detail || null };
}

export function createGatekeeper({ repository, github, clock, log }) {
  const now = typeof clock === 'function' ? clock : () => new Date().toISOString();
  const logger = log || (() => {});

  async function recordAudit(state, decision, detail) {
    // Audit-before-action: recording failures/denials is best-effort and must
    // never block the refusal itself.
    try {
      await repository.recordDecision({
        state: state,
        decision: decision,
        detail: detail,
        at: now(),
      });
    } catch (error) {
      logger('GATEKEEPER_AUDIT_WRITE_FAILED ' + (error && error.message ? error.message : String(error)));
    }
  }

  async function handleLockCommand(command, fromUserId, allowlist) {
    const lock = await repository.getLock();
    if (command === GATE_COMMANDS.STATUS) {
      return {
        ok: true,
        code: 'GATE_STATUS',
        locked: Boolean(lock && lock.locked),
        lockedAt: lock && lock.locked_at ? lock.locked_at : null,
        lockedBy: lock && lock.locked_by ? lock.locked_by : null,
      };
    }
    if (!isAuthorizedApprover(fromUserId, allowlist)) {
      return reply('NOT_AUTHORIZED');
    }
    const wantLocked = command === GATE_COMMANDS.LOCK;
    await repository.setLock({ locked: wantLocked, by: fromUserId, at: now() });
    return { ok: true, code: wantLocked ? 'GATE_LOCKED' : 'GATE_UNLOCKED', locked: wantLocked };
  }

  async function handleApproval(parsed, fromUserId, allowlist, commandText) {
    const key = approvalKey(parsed.kind, parsed.target);
    const lock = await repository.getLock();
    if (lock && lock.locked) {
      return reply('GATE_LOCKED', 'Approvals are refused while the gate is locked. Send /unlock first.');
    }
    const previous = await repository.findApproval(parsed.kind, parsed.target);
    if (previous && (previous.status === 'EXECUTING' || previous.status === 'EXECUTED')) {
      // Idempotent: the same target can never be actioned twice.
      return reply('ALREADY_APPROVED', 'Target ' + key + ' already has an active or completed approval.');
    }
    if (parsed.kind !== GATE_KINDS.PR) {
      // MVP scope: PR merge only. Migration/settle executors arrive in later
      // phases; the attempt is still audited before refusing.
      await recordAudit(
        { kind: parsed.kind, target: parsed.target, approverId: fromUserId, commandText: commandText },
        'REJECTED_NOT_IMPLEMENTED',
        'Executor for kind ' + parsed.kind + ' is not implemented in the MVP.'
      );
      return reply('NOT_IMPLEMENTED', 'Only /approve <PR> is wired in the MVP.');
    }
    // INVARIANT 1: audit record BEFORE the action. If the audit write fails,
    // the action MUST NOT happen.
    let approvalId;
    try {
      approvalId = await repository.startApproval({
        kind: parsed.kind,
        target: parsed.target,
        approverId: fromUserId,
        commandText: commandText,
        at: now(),
      });
    } catch (error) {
      logger('GATEKEEPER_AUDIT_UNAVAILABLE ' + (error && error.message ? error.message : String(error)));
      return reply('AUDIT_UNAVAILABLE', 'Action refused: the approval could not be recorded before acting.');
    }
    try {
      const result = await github.mergePullRequest(Number(parsed.target));
      await repository.finalizeApproval(approvalId, { status: 'EXECUTED', result: result || null, at: now() });
      return { ok: true, code: 'APPROVED', kind: parsed.kind, target: parsed.target, result: result || null };
    } catch (error) {
      // INVARIANT 5: terminal failure, recorded, never auto-retried.
      await repository.finalizeApproval(approvalId, {
        status: 'FAILED',
        detail: error && error.message ? error.message : String(error),
        at: now(),
      });
      return reply('ACTION_FAILED', 'PR merge failed and was recorded. No automatic retry will happen.');
    }
  }

  return Object.freeze({
    async handleCommand({ text, fromUserId, commandText }) {
      const allowlist = parseApproverAllowlist(process.env.CE_GATEKEEPER_TELEGRAM_IDS);
      if (allowlist.length === 0) {
        // INVARIANT 6: inert until configured.
        return reply('GATEKEEPER_DISABLED', 'CE_GATEKEEPER_TELEGRAM_IDS is not configured; the gate is inert.');
      }
      const parsed = parseApprovalCommand(text);
      if (!parsed.ok) {
        await recordAudit({ approverId: fromUserId, commandText: commandText || text }, 'REJECTED_UNRECOGNIZED', text);
        return reply('UNRECOGNIZED_COMMAND', 'Use /approve <PR>, /approve migration <id>, /approve settle <id>, /lock, /unlock, /gatestatus.');
      }
      if (parsed.command === GATE_COMMANDS.APPROVE) {
        if (!isAuthorizedApprover(fromUserId, allowlist)) {
          await recordAudit(
            { kind: parsed.kind, target: parsed.target, approverId: fromUserId, commandText: commandText || text },
            'DENIED_NOT_AUTHORIZED',
            'Approver Telegram ID is not allowlisted.'
          );
          return reply('NOT_AUTHORIZED');
        }
        return handleApproval(parsed, fromUserId, allowlist, commandText || text);
      }
      return handleLockCommand(parsed.command, fromUserId, allowlist);
    },
  });
}
`;

// ---------------------------------------------------------------------------
// gatekeeper-runtime.mjs — Phase 2 wiring: real adapters around the pure core.
// Command surface: /gate (namespace avoids the existing /approve slip flow).
//   /gate approve 42 | /gate approve migration <id> | /gate approve settle <id>
//   /gate lock | /gate unlock | /gate status | bare /gate = status
// ---------------------------------------------------------------------------

const runtimeSource = String.raw`// CE VAULT GATEKEEPER runtime wiring (docs/GATEKEEPER.md)
import { createGatekeeper } from "./gatekeeper.mjs";

// Translate the /gate Telegram namespace into the core /approve grammar.
// Returns null when the text is not a gate command at all.
export function normalizeGateText(rawText) {
  const text = String(rawText == null ? '' : rawText).trim();
  const match = /^\/gate(?:@\w+)?\s*(.*)$/i.exec(text);
  if (!match) return null;
  const rest = match[1].trim();
  if (!rest) return '/gatestatus';
  if (/^approve\b/i.test(rest)) return '/' + rest;
  if (/^migration\b/i.test(rest) || /^settle\b/i.test(rest)) return '/approve ' + rest;
  if (/^gatestatus$/i.test(rest)) return '/gatestatus';
  if (/^status$/i.test(rest)) return '/gatestatus';
  if (/^(lock|unlock)$/i.test(rest)) return '/' + rest.toLowerCase();
  if (/^#?\d{1,6}$/.test(rest)) return '/approve ' + rest.replace(/^#/, '');
  return '/' + rest;
}

export function gateReplyText(result) {
  if (!result) return 'GATEKEEPER · INTERNAL_ERROR';
  if (result.ok && result.code === 'APPROVED') {
    const sha = result.result && result.result.sha ? ' · ' + result.result.sha : '';
    return 'GATEKEEPER · APPROVED · ' + result.kind.toUpperCase() + ' ' + result.target + sha;
  }
  if (result.ok && result.code === 'GATE_STATUS') {
    if (result.locked) {
      return 'GATEKEEPER · LOCKED since ' + String(result.lockedAt || 'unknown') + ' by ' + String(result.lockedBy || 'unknown');
    }
    return 'GATEKEEPER · UNLOCKED · approvals allowed';
  }
  if (result.ok && result.code === 'GATE_LOCKED') return 'GATEKEEPER · GATE LOCKED · approvals refused';
  if (result.ok && result.code === 'GATE_UNLOCKED') return 'GATEKEEPER · GATE UNLOCKED · approvals allowed';
  const detail = result.detail ? '\n' + result.detail : '';
  return 'GATEKEEPER · ' + String(result.code || 'INTERNAL_ERROR') + detail;
}

// GitHub merge adapter. Fail-closed: no token -> throw, never a silent no-op.
export function createGitHubMergeAdapter(env, fetchImpl) {
  const doFetch = fetchImpl || ((...args) => fetch(...args));
  return Object.freeze({
    async mergePullRequest(prNumber) {
      const token = String(env.GATEKEEPER_GITHUB_TOKEN || '').trim();
      if (!token) throw new Error('GATEKEEPER_GITHUB_TOKEN_NOT_CONFIGURED');
      const repoSlug = String(env.GATEKEEPER_REPO || 'SHELBYY-21/CE-VAULT-Bot');
      const response = await doFetch('https://api.github.com/repos/' + repoSlug + '/pulls/' + prNumber + '/merge', {
        method: 'PUT',
        headers: {
          authorization: 'Bearer ' + token,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'x-github-api-version': '2022-11-28',
        },
        body: JSON.stringify({ merge_method: 'merge' }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const reason = String((payload && payload.message) || '').replace(/\s+/g, ' ').slice(0, 120);
        throw new Error('GITHUB_MERGE_HTTP_' + response.status + (reason ? ': ' + reason : ''));
      }
      return { merged: true, sha: (payload && payload.sha) || null, pr: prNumber };
    },
  });
}

// Map the core repository contract onto the Supabase-backed repo methods.
export function makeRepositoryAdapter(repo) {
  const requireRepo = () => {
    if (!repo) throw new Error('REPOSITORY_NOT_CONFIGURED');
    return repo;
  };
  return Object.freeze({
    async getLock() {
      const row = await requireRepo().gatekeeperGetLock();
      return row
        ? { locked: Boolean(row.locked), locked_by: row.locked_by || null, locked_at: row.locked_at || null }
        : { locked: false, locked_by: null, locked_at: null };
    },
    async setLock(input) {
      await requireRepo().gatekeeperSetLock({ locked: input.locked, by: input.by, at: input.at });
      return { locked: input.locked };
    },
    async findApproval(kind, target) {
      return requireRepo().gatekeeperFindApproval(kind, target);
    },
    async startApproval(input) {
      return requireRepo().gatekeeperStartApproval(input);
    },
    async finalizeApproval(id, patch) {
      return requireRepo().gatekeeperFinalizeApproval(id, patch);
    },
    async recordDecision(input) {
      return requireRepo().gatekeeperRecordDecision(input);
    },
  });
}

export function createGatekeeperRuntime({ repository, telegram, env, fetchImpl, clock }) {
  const gate = createGatekeeper({
    repository: makeRepositoryAdapter(repository),
    github: createGitHubMergeAdapter(env || process.env, fetchImpl),
    clock,
  });
  return Object.freeze({
    async handleTelegramGateMessage(message) {
      const chatId = message && message.chat && message.chat.id;
      const fromUserId = message && message.from && message.from.id;
      const text = (message && message.text) || '';
      const normalized = normalizeGateText(text);
      if (normalized == null) return false;
      let result;
      try {
        result = await gate.handleCommand({ text: normalized, fromUserId, commandText: text });
      } catch (error) {
        result = { ok: false, code: 'INTERNAL_ERROR', detail: String((error && error.message) || error) };
      }
      if (telegram && chatId) {
        try {
          await telegram.sendMessageWithMarkup(String(chatId), gateReplyText(result), undefined);
        } catch {
          // Reply delivery is best-effort; the audit record in Supabase is the
          // source of truth for what happened.
        }
      }
      return true;
    },
  });
}
`;

const testSource = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseApprovalCommand,
  parseApproverAllowlist,
  isAuthorizedApprover,
  createGatekeeper,
  GATE_KINDS,
} from '../server/gatekeeper.mjs';
import {
  normalizeGateText,
  gateReplyText,
  createGitHubMergeAdapter,
  makeRepositoryAdapter,
  createGatekeeperRuntime,
} from '../server/gatekeeper-runtime.mjs';

function makeRepository(options) {
  const calls = [];
  let approvalCounter = 0;
  const approvals = (options && options.approvals) || [];
  const repo = {
    calls: calls,
    lock: (options && options.lock) || { locked: false },
    async recordDecision(input) {
      calls.push(['recordDecision', input]);
    },
    async getLock() {
      calls.push(['getLock']);
      return repo.lock;
    },
    async setLock(input) {
      calls.push(['setLock', input]);
      repo.lock = { locked: input.locked, locked_by: input.by, locked_at: input.at };
    },
    async findApproval(kind, target) {
      calls.push(['findApproval', kind, target]);
      return approvals.find((row) => row.kind === kind && row.target === target) || null;
    },
    async startApproval(input) {
      calls.push(['startApproval', input]);
      if (options && options.failStartApproval) throw new Error('AUDIT_DOWN');
      approvalCounter += 1;
      const id = 'approval-' + approvalCounter;
      approvals.push({ id: id, kind: input.kind, target: input.target, status: 'EXECUTING' });
      return id;
    },
    async finalizeApproval(id, patch) {
      calls.push(['finalizeApproval', id, patch]);
      const row = approvals.find((entry) => entry.id === id);
      if (row) {
        row.status = patch.status;
        row.result = patch.result || null;
      }
    },
  };
  return repo;
}

function makeGithub(order, behavior) {
  return {
    async mergePullRequest(number) {
      order.push('merge:' + number);
      if (behavior && behavior.failMerge) throw new Error('MERGE_CONFLICT');
      return { merged: true, number: number };
    },
  };
}

test('command parsing accepts the three approval forms and gate commands', () => {
  assert.deepEqual(parseApprovalCommand('/approve 42'), { ok: true, command: 'approve', kind: GATE_KINDS.PR, target: '42' });
  assert.deepEqual(parseApprovalCommand('/approve #42'), { ok: true, command: 'approve', kind: GATE_KINDS.PR, target: '42' });
  assert.deepEqual(parseApprovalCommand('/approve migration mig-001'), { ok: true, command: 'approve', kind: 'migration', target: 'mig-001' });
  assert.deepEqual(parseApprovalCommand('/APPROVE settle st_9.x'), { ok: true, command: 'approve', kind: 'settle', target: 'st_9.x' });
  assert.equal(parseApprovalCommand('/lock').command, 'lock');
  assert.equal(parseApprovalCommand('/unlock').command, 'unlock');
  assert.equal(parseApprovalCommand('/gatestatus').command, 'status');
});

test('command parsing rejects malformed input', () => {
  assert.equal(parseApprovalCommand('/approve').ok, false);
  assert.equal(parseApprovalCommand('/approve abc').ok, false);
  assert.equal(parseApprovalCommand('/approve 9999999').ok, false);
  assert.equal(parseApprovalCommand('/approve migration').ok, false);
  assert.equal(parseApprovalCommand('/approve pr 12').ok, false);
  assert.equal(parseApprovalCommand('/merge 12').ok, false);
  assert.equal(parseApprovalCommand('').ok, false);
  assert.equal(parseApprovalCommand(null).ok, false);
});

test('approver allowlist parsing and authorization', () => {
  assert.deepEqual(parseApproverAllowlist(' 111, 222 ,333 '), [111, 222, 333]);
  assert.deepEqual(parseApproverAllowlist(''), []);
  assert.deepEqual(parseApproverAllowlist('abc, 44, '), [44]);
  assert.equal(isAuthorizedApprover(111, [111, 222]), true);
  assert.equal(isAuthorizedApprover(999, [111, 222]), false);
  assert.equal(isAuthorizedApprover(111, []), false);
  assert.equal(isAuthorizedApprover('111', [111]), true);
  assert.equal(isAuthorizedApprover(null, [111]), false);
  assert.equal(isAuthorizedApprover('abc', [111]), false);
});

test('gate is inert until CE_GATEKEEPER_TELEGRAM_IDS is configured', async () => {
  delete process.env.CE_GATEKEEPER_TELEGRAM_IDS;
  const repo = makeRepository();
  const gate = createGatekeeper({ repository: repo, github: makeGithub(repo.calls), clock: () => '2026-10-28T00:00:00Z' });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'GATEKEEPER_DISABLED');
  assert.equal(repo.calls.length, 0);
});

test('approval writes the audit record BEFORE the merge and reports success', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const order = [];
  const gate = createGatekeeper({
    repository: repo,
    github: makeGithub(order),
    clock: () => '2026-10-28T00:00:00Z',
  });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 111, commandText: '/approve 42' });
  assert.equal(result.ok, true);
  assert.equal(result.code, 'APPROVED');
  assert.equal(order.length, 1); // exactly one merge, after the audit start below
  const calls = repo.calls.map((entry) => entry[0]);
  assert.ok(calls.indexOf('startApproval') < calls.indexOf('finalizeApproval'));
  assert.equal(order[0], 'merge:42');
  const started = repo.calls.find((entry) => entry[0] === 'startApproval');
  assert.equal(started[1].kind, 'pr');
  assert.equal(started[1].target, '42');
  assert.equal(started[1].approverId, 111);
  const finalized = repo.calls.find((entry) => entry[0] === 'finalizeApproval');
  assert.equal(finalized[2].status, 'EXECUTED');
});

test('a second approval for the same target is refused (idempotency)', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository({ approvals: [{ id: 'a1', kind: 'pr', target: '42', status: 'EXECUTED' }] });
  const order = [];
  const gate = createGatekeeper({ repository: repo, github: makeGithub(order), clock: () => '2026-10-28T00:00:00Z' });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ALREADY_APPROVED');
  assert.equal(order.length, 0); // no merge attempted
});

test('non-allowlisted approvers are denied and audited, never merged', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const order = [];
  const gate = createGatekeeper({ repository: repo, github: makeGithub(order), clock: () => '2026-10-28T00:00:00Z' });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 666, commandText: '/approve 42' });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'NOT_AUTHORIZED');
  assert.equal(order.length, 0);
  const denied = repo.calls.find((entry) => entry[0] === 'recordDecision');
  assert.equal(denied[1].decision, 'DENIED_NOT_AUTHORIZED');
});

test('if the audit write fails the action is refused (audit-before-action)', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository({ failStartApproval: true });
  const order = [];
  const gate = createGatekeeper({ repository: repo, github: makeGithub(order), clock: () => '2026-10-28T00:00:00Z' });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'AUDIT_UNAVAILABLE');
  assert.equal(order.length, 0); // merge never happened
});

test('merge failure is recorded as terminal FAILED with no retry', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const order = [];
  const gate = createGatekeeper({
    repository: repo,
    github: makeGithub(order, { failMerge: true }),
    clock: () => '2026-10-28T00:00:00Z',
  });
  const result = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(result.ok, false);
  assert.equal(result.code, 'ACTION_FAILED');
  assert.equal(order.length, 1); // exactly one merge attempt, no retry
  const finalized = repo.calls.find((entry) => entry[0] === 'finalizeApproval');
  assert.equal(finalized[2].status, 'FAILED');
});

test('lock refuses approvals and unlock restores them', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository({ lock: { locked: true, locked_by: 111, locked_at: 't' } });
  const order = [];
  const gate = createGatekeeper({ repository: repo, github: makeGithub(order), clock: () => '2026-10-28T00:00:00Z' });
  const refused = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(refused.code, 'GATE_LOCKED');
  assert.equal(order.length, 0);
  const status = await gate.handleCommand({ text: '/gatestatus', fromUserId: 111 });
  assert.equal(status.locked, true);
  const unlocked = await gate.handleCommand({ text: '/unlock', fromUserId: 111 });
  assert.equal(unlocked.code, 'GATE_UNLOCKED');
  const approved = await gate.handleCommand({ text: '/approve 42', fromUserId: 111 });
  assert.equal(approved.code, 'APPROVED');
});

test('migration and settle approvals are audited then refused as not implemented', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const gate = createGatekeeper({ repository: repo, github: makeGithub(repo.calls), clock: () => '2026-10-28T00:00:00Z' });
  const migration = await gate.handleCommand({ text: '/approve migration mig-1', fromUserId: 111, commandText: 'x' });
  assert.equal(migration.code, 'NOT_IMPLEMENTED');
  const settle = await gate.handleCommand({ text: '/approve settle st-1', fromUserId: 111, commandText: 'y' });
  assert.equal(settle.code, 'NOT_IMPLEMENTED');
  assert.equal(repo.calls.filter((entry) => entry[0] === 'recordDecision').length, 2);
});

test('status works even before authorization but lock/unlock require it', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const gate = createGatekeeper({ repository: repo, github: makeGithub(repo.calls), clock: () => '2026-10-28T00:00:00Z' });
  const status = await gate.handleCommand({ text: '/gatestatus', fromUserId: 999 });
  assert.equal(status.ok, true);
  const lock = await gate.handleCommand({ text: '/lock', fromUserId: 999 });
  assert.equal(lock.code, 'NOT_AUTHORIZED');
});

test('unrecognized commands are audited then refused', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRepository();
  const gate = createGatekeeper({ repository: repo, github: makeGithub(repo.calls), clock: () => '2026-10-28T00:00:00Z' });
  const result = await gate.handleCommand({ text: '/selfdestruct', fromUserId: 111, commandText: '/selfdestruct' });
  assert.equal(result.code, 'UNRECOGNIZED_COMMAND');
  const recorded = repo.calls.find((entry) => entry[0] === 'recordDecision');
  assert.equal(recorded[1].decision, 'REJECTED_UNRECOGNIZED');
});

// --- Phase 2: /gate namespace + runtime wiring ---

test('gate namespace normalization maps /gate to the core grammar', () => {
  assert.equal(normalizeGateText('/gate approve 42'), '/approve 42');
  assert.equal(normalizeGateText('/gate@cevault_bot approve 42'), '/approve 42');
  assert.equal(normalizeGateText('/gate 42'), '/approve 42');
  assert.equal(normalizeGateText('/gate #42'), '/approve 42');
  assert.equal(normalizeGateText('/gate approve migration mig-1'), '/approve migration mig-1');
  assert.equal(normalizeGateText('/gate migration mig-1'), '/approve migration mig-1');
  assert.equal(normalizeGateText('/gate settle st-1'), '/approve settle st-1');
  assert.equal(normalizeGateText('/gate lock'), '/lock');
  assert.equal(normalizeGateText('/gate unlock'), '/unlock');
  assert.equal(normalizeGateText('/gate status'), '/gatestatus');
  assert.equal(normalizeGateText('/gate'), '/gatestatus');
  assert.equal(normalizeGateText('/gate nonsense x'), '/nonsense x');
  assert.equal(normalizeGateText('/approve 42'), null);
  assert.equal(normalizeGateText('hello'), null);
  assert.equal(normalizeGateText(null), null);
});

test('gate reply text maps results to operator messages', () => {
  assert.match(gateReplyText({ ok: true, code: 'APPROVED', kind: 'pr', target: '42', result: { sha: 'abc' } }), /APPROVED · PR 42 · abc/);
  assert.equal(gateReplyText({ ok: true, code: 'GATE_STATUS', locked: false }), 'GATEKEEPER · UNLOCKED · approvals allowed');
  assert.match(gateReplyText({ ok: true, code: 'GATE_STATUS', locked: true, lockedAt: 't', lockedBy: 111 }), /LOCKED since t by 111/);
  assert.match(gateReplyText({ ok: false, code: 'NOT_AUTHORIZED' }), /NOT_AUTHORIZED/);
  assert.match(gateReplyText({ ok: false, code: 'AUDIT_UNAVAILABLE', detail: 'x' }), /AUDIT_UNAVAILABLE\nx/);
  assert.equal(gateReplyText(null), 'GATEKEEPER · INTERNAL_ERROR');
});

test('github merge adapter fails closed without a token and surfaces HTTP errors', async () => {
  const calls = [];
  const fakeFetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ sha: 'deadbeef' }) };
  };
  const adapter = createGitHubMergeAdapter({ GATEKEEPER_GITHUB_TOKEN: 't' }, fakeFetch);
  const result = await adapter.mergePullRequest(42);
  assert.equal(result.merged, true);
  assert.equal(result.sha, 'deadbeef');
  assert.match(calls[0].url, /SHELBYY-21\/CE-VAULT-Bot\/pulls\/42\/merge$/);
  assert.equal(calls[0].init.method, 'PUT');
  assert.equal(JSON.parse(calls[0].init.body).merge_method, 'merge');

  const noToken = createGitHubMergeAdapter({}, fakeFetch);
  await assert.rejects(() => noToken.mergePullRequest(42), /GATEKEEPER_GITHUB_TOKEN_NOT_CONFIGURED/);
  assert.equal(calls.length, 1); // no network call attempted

  const failing = createGitHubMergeAdapter({ GATEKEEPER_GITHUB_TOKEN: 't' }, async () => ({
    ok: false, status: 405, json: async () => ({ message: 'Pull Request is not mergeable' }),
  }));
  await assert.rejects(() => failing.mergePullRequest(42), /GITHUB_MERGE_HTTP_405: Pull Request is not mergeable/);
});

test('repository adapter guards against unconfigured repository and maps locks', async () => {
  await assert.rejects(async () => makeRepositoryAdapter(null).getLock(), /REPOSITORY_NOT_CONFIGURED/);
  const repo = {
    async gatekeeperGetLock() { return { locked: true, locked_by: 111, locked_at: '2026-10-28T00:00:00Z' }; },
    async gatekeeperSetLock() {},
    async gatekeeperFindApproval() { return null; },
    async gatekeeperStartApproval() { return 'id-1'; },
    async gatekeeperFinalizeApproval() {},
    async gatekeeperRecordDecision() {},
  };
  const adapter = makeRepositoryAdapter(repo);
  const lock = await adapter.getLock();
  assert.equal(lock.locked, true);
  assert.equal(lock.locked_by, 111);
  const missing = await makeRepositoryAdapter({ async gatekeeperGetLock() { return null; } }).getLock();
  assert.deepEqual(missing, { locked: false, locked_by: null, locked_at: null });
});

function makeRuntimeRepository(options) {
  const raw = {
    lock: (options && options.lock) || { locked: false, locked_by: null, locked_at: null },
    decisions: (options && options.decisions) || [],
    approvals: (options && options.approvals) || [],
  };
  raw.gatekeeperGetLock = async () => raw.lock;
  raw.gatekeeperSetLock = async (input) => { raw.lock = { locked: input.locked, locked_by: input.by, locked_at: input.at }; };
  raw.gatekeeperFindApproval = async (kind, target) => raw.approvals.find((row) => row.kind === kind && row.target === target) || null;
  raw.gatekeeperStartApproval = async (input) => {
    raw.approvals.push({ id: 'a1', kind: input.kind, target: input.target, status: 'EXECUTING' });
    return 'a1';
  };
  raw.gatekeeperFinalizeApproval = async (id, patch) => {
    const row = raw.approvals.find((entry) => entry.id === id);
    if (row) row.status = patch.status;
  };
  raw.gatekeeperRecordDecision = async (input) => { raw.decisions.push(input); };
  return raw;
}

function makeRuntimeTelegram() {
  const sent = [];
  return { sent, async sendMessageWithMarkup(chatId, text) { sent.push({ chatId, text }); } };
}

function makeRuntimeFetch(sha) {
  return async () => ({ ok: true, status: 200, json: async () => ({ sha: sha || 'mergedsha' }) });
}

test('runtime handles /gate approve end to end and replies in Telegram', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  process.env.GATEKEEPER_GITHUB_TOKEN = 'tok';
  const repo = makeRuntimeRepository({});
  const telegram = makeRuntimeTelegram();
  const runtime = createGatekeeperRuntime({
    repository: repo,
    telegram,
    env: process.env,
    fetchImpl: makeRuntimeFetch(),
    clock: () => '2026-10-28T00:00:00Z',
  });
  const handled = await runtime.handleTelegramGateMessage({ text: '/gate approve 42', chat: { id: 555 }, from: { id: 111 } });
  assert.equal(handled, true);
  assert.equal(telegram.sent.length, 1);
  assert.match(telegram.sent[0].text, /APPROVED · PR 42 · mergedsha/);
  assert.equal(telegram.sent[0].chatId, '555');
  const notGate = await runtime.handleTelegramGateMessage({ text: '/start', chat: { id: 555 }, from: { id: 111 } });
  assert.equal(notGate, false);
  assert.equal(telegram.sent.length, 1);
});

test('runtime refuses unauthorized /gate approvals with a Telegram reply', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const repo = makeRuntimeRepository({});
  const telegram = makeRuntimeTelegram();
  const runtime = createGatekeeperRuntime({
    repository: repo,
    telegram,
    env: process.env,
    fetchImpl: makeRuntimeFetch(),
    clock: () => '2026-10-28T00:00:00Z',
  });
  await runtime.handleTelegramGateMessage({ text: '/gate approve 42', chat: { id: 555 }, from: { id: 666 } });
  assert.equal(telegram.sent.length, 1);
  assert.match(telegram.sent[0].text, /NOT_AUTHORIZED/);
  assert.equal(repo.approvals.length, 0); // no approval row, no merge
});

test('runtime reports INTERNAL_ERROR without crashing when the repository is unavailable', async () => {
  process.env.CE_GATEKEEPER_TELEGRAM_IDS = '111';
  const telegram = makeRuntimeTelegram();
  const runtime = createGatekeeperRuntime({
    repository: null,
    telegram,
    env: process.env,
    fetchImpl: makeRuntimeFetch(),
    clock: () => '2026-10-28T00:00:00Z',
  });
  const handled = await runtime.handleTelegramGateMessage({ text: '/gate status', chat: { id: 555 }, from: { id: 111 } });
  assert.equal(handled, true);
  assert.match(telegram.sent[0].text, /INTERNAL_ERROR|REPOSITORY_NOT_CONFIGURED/);
});
`;

writeFileSync(serverPath, moduleSource);
writeFileSync(runtimePath, runtimeSource);
writeFileSync(testsPath, testSource);

// --- Phase 2 wiring: Supabase repository adapter methods ---
// Anchor is created by patch-live-intake (which always runs before this patch):
// the getOperatorByTelegramId method is the first entry of the frozen repo object.
const repoSource = readFileSync(repoPath, 'utf8');
const repoAnchor = '  return Object.freeze({\n    async getOperatorByTelegramId(telegramUserId) {';
const repoGateMethods = String.raw`  return Object.freeze({
    async gatekeeperGetLock() {
      return ensureData(await db.from("gatekeeper_locks")
        .select("locked,locked_by,locked_at")
        .eq("id", true)
        .maybeSingle());
    },
    async gatekeeperSetLock({ locked, by, at }) {
      return ensureData(await db.from("gatekeeper_locks")
        .upsert({ id: true, locked: Boolean(locked), locked_by: by ?? null, locked_at: at, reason: "telegram /gate lock" })
        .select("locked,locked_by,locked_at")
        .single());
    },
    async gatekeeperFindApproval(kind, target) {
      return ensureData(await db.from("gatekeeper_approvals")
        .select("id,kind,target,status")
        .eq("kind", kind)
        .eq("target", target)
        .in("status", ["EXECUTING", "EXECUTED"])
        .limit(1)
        .maybeSingle());
    },
    async gatekeeperStartApproval({ kind, target, approverId, commandText, at }) {
      // The partial unique index on (kind,target) is the hard idempotency guard.
      return ensureData(await db.from("gatekeeper_approvals")
        .insert({ kind, target, approver_telegram_id: approverId ?? null, command_text: commandText ?? null, requested_at: at, status: "EXECUTING" })
        .select("id")
        .single());
    },
    async gatekeeperFinalizeApproval(id, { status, result, detail, at }) {
      return ensureData(await db.from("gatekeeper_approvals")
        .update({ status, result: result ?? null, detail: detail ?? null, updated_at: at })
        .eq("id", id)
        .select("id,status")
        .single());
    },
    async gatekeeperRecordDecision({ state, decision, detail, at }) {
      return ensureData(await db.from("gatekeeper_approvals")
        .insert({
          kind: state?.kind ?? null,
          target: state?.target ?? null,
          approver_telegram_id: state?.approverId ?? null,
          command_text: state?.commandText ?? null,
          requested_at: at,
          status: decision,
          detail: detail ?? null,
        })
        .select("id")
        .single());
    },
    async getOperatorByTelegramId(telegramUserId) {`;
if (!repoSource.includes(repoAnchor)) throw new Error('GATEKEEPER_REPO_ANCHOR_NOT_FOUND');
writeFileSync(repoPath, repoSource.replace(repoAnchor, repoGateMethods));

// --- Phase 2 wiring: Telegram /gate command route in server/index.mjs ---
let serverIndex = readFileSync(indexPath, 'utf8');

// 1. Import the runtime module next to the slip-verify import (created by patch-live-intake).
const importAnchor = 'import { decodeSlipQrPayload } from "./slip-verify.mjs";';
if (!serverIndex.includes(importAnchor)) throw new Error('GATEKEEPER_IMPORT_ANCHOR_NOT_FOUND');
serverIndex = replaceOnce(
  serverIndex,
  importAnchor,
  importAnchor + '\nimport { createGatekeeperRuntime } from "./gatekeeper-runtime.mjs";',
  'GATEKEEPER_IMPORT_DUPLICATE',
);
if ((serverIndex.match(/from "\.\/gatekeeper-runtime\.mjs"/g) || []).length !== 1) {
  throw new Error('GATEKEEPER_IMPORT_ALREADY_PRESENT');
}

// 2. Handler + lazy runtime binding, injected right before processTelegramUpdate
//    (the helpers block added by patch-live-intake sits above it, so this anchor is unique).
const processAnchor = '\nasync function processTelegramUpdate(update) {';
if (!serverIndex.includes(processAnchor)) throw new Error('GATEKEEPER_PROCESS_ANCHOR_NOT_FOUND');
const gateHandler = `
// CE GATEKEEPER: Telegram approval gate (/gate namespace). Audit record in
// Supabase happens BEFORE any merge action; see docs/GATEKEEPER.md.
let gatekeeperRuntimeRef = null;
function getGatekeeperRuntime() {
  if (!gatekeeperRuntimeRef) {
    gatekeeperRuntimeRef = createGatekeeperRuntime({ repository, telegram });
  }
  return gatekeeperRuntimeRef;
}

async function handleGateCommand(message) {
  try {
    await getGatekeeperRuntime().handleTelegramGateMessage(message);
  } catch (error) {
    console.error("[CE GATEKEEPER] command failed: " + String(error?.message || error));
  }
}

async function processTelegramUpdate(update) {`;
serverIndex = replaceOnce(serverIndex, processAnchor, gateHandler, 'GATEKEEPER_HANDLER_INJECT_FAILED');

// 3. Route /gate BEFORE the existing /approve slip flow (namespace separation).
const approveAnchor = '  if (message?.chat?.id && /^\\/approve(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramApprove(message);\n    return;\n  }';
if (!serverIndex.includes(approveAnchor)) throw new Error('GATEKEEPER_APPROVE_ANCHOR_NOT_FOUND');
const gateRoute = String.raw`  if (message?.chat?.id && /^\/gate(?:@\w+)?(?:\s|$)/i.test(message.text || "")) {
    await handleGateCommand(message);
    return;
  }
` + approveAnchor;
serverIndex = replaceOnce(serverIndex, approveAnchor, gateRoute, 'GATEKEEPER_ROUTE_INJECT_FAILED');
writeFileSync(indexPath, serverIndex);

console.log('Patched CE VAULT GATEKEEPER: core module + runtime wiring + /gate Telegram route + Supabase audit adapters.');
