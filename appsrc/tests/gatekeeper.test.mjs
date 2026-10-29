import test from 'node:test';
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
