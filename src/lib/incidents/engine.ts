export const INCIDENT_TYPES = ['SETTLEMENT_PENDING','RETRY_EXHAUSTED','DUPLICATE_WEBHOOK','RECONCILIATION_MISMATCH','LOW_BALANCE'] as const;
export type IncidentType = typeof INCIDENT_TYPES[number];

export type IncidentInput = {
  type: IncidentType;
  source: string;
  entityId: string;
  status?: string;
  pendingSince?: string;
  retryCount?: number;
  maxRetries?: number;
  duplicateCount?: number;
  expected?: number;
  actual?: number;
  balance?: number;
  threshold?: number;
  occurredAt?: string;
};

export type SafeIncident = {
  type: IncidentType;
  source: string;
  entityId: string;
  severity: 'warning' | 'critical';
  reason: string;
  dedupeKey: string;
  occurredAt: string;
};

const safeToken = (value: string) => value.replace(/[^a-zA-Z0-9_.:-]/g, '_').slice(0, 96);
const n = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : undefined;

export function evaluateIncident(input: IncidentInput, now = new Date()): SafeIncident | null {
  const occurredAt = input.occurredAt || now.toISOString();
  let reason = '';
  let severity: SafeIncident['severity'] = 'warning';

  switch (input.type) {
    case 'SETTLEMENT_PENDING': {
      if (!input.pendingSince) return null;
      const ageMs = now.getTime() - new Date(input.pendingSince).getTime();
      if (!Number.isFinite(ageMs) || ageMs <= 10 * 60 * 1000) return null;
      reason = 'settlement_pending_over_10m';
      severity = 'critical';
      break;
    }
    case 'RETRY_EXHAUSTED':
      if (n(input.retryCount) === undefined || n(input.maxRetries) === undefined || input.retryCount! < input.maxRetries!) return null;
      reason = 'retry_budget_exhausted';
      severity = 'critical';
      break;
    case 'DUPLICATE_WEBHOOK':
      if ((n(input.duplicateCount) || 0) < 1) return null;
      reason = 'duplicate_webhook_suppressed';
      break;
    case 'RECONCILIATION_MISMATCH':
      if (n(input.expected) === undefined || n(input.actual) === undefined || input.expected === input.actual) return null;
      reason = 'reconciliation_mismatch';
      severity = 'critical';
      break;
    case 'LOW_BALANCE':
      if (n(input.balance) === undefined || n(input.threshold) === undefined || input.balance! >= input.threshold!) return null;
      reason = 'balance_below_threshold';
      break;
  }

  const source = safeToken(input.source);
  const entityId = safeToken(input.entityId);
  return {
    type: input.type,
    source,
    entityId,
    severity,
    reason,
    dedupeKey: ['ce', input.type.toLowerCase(), source, entityId].join(':'),
    occurredAt,
  };
}

export function toOutboundIncident(input: SafeIncident) {
  // Explicit allowlist. Never spread raw input into outbound payloads.
  return {
    type: input.type,
    source: input.source,
    entityId: input.entityId,
    severity: input.severity,
    reason: input.reason,
    dedupeKey: input.dedupeKey,
    occurredAt: input.occurredAt,
  };
}
