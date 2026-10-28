import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'appsrc');
const serverPath = path.join(appRoot, 'server', 'gatekeeper.mjs');
const testsPath = path.join(appRoot, 'tests', 'gatekeeper.test.mjs');

mkdirSync(path.dirname(serverPath), { recursive: true });
mkdirSync(path.dirname(testsPath), { recursive: true });

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
  const id = Number(telegramUserId);
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

const testSource = String.raw`import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseApprovalCommand,
  parseApproverAllowlist,
  isAuthorizedApprover,
  createGatekeeper,
  GATE_KINDS,
} from '../server/gatekeeper.mjs';

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
  assert.equal(isAuthorizedApprover('111', [111]), false);
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
`;

writeFileSync(serverPath, moduleSource);
writeFileSync(testsPath, testSource);
console.log('Patched CE VAULT GATEKEEPER MVP skeleton (server/gatekeeper.mjs + tests).');
