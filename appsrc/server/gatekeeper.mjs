// CE VAULT GATEKEEPER — MVP skeleton (docs/GATEKEEPER.md)
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
