// CE VAULT GATEKEEPER runtime wiring (docs/GATEKEEPER.md)
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
