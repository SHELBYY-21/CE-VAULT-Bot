import assert from 'node:assert/strict';
import { evaluateIncident, toOutboundIncident } from '../src/lib/incidents/engine.ts';

const now = new Date('2026-10-05T09:00:00.000Z');
const cases = [
  { type:'SETTLEMENT_PENDING', source:'settlement', entityId:'synthetic-1', pendingSince:'2026-10-05T08:49:00.000Z' },
  { type:'RETRY_EXHAUSTED', source:'worker', entityId:'synthetic-2', retryCount:3, maxRetries:3 },
  { type:'DUPLICATE_WEBHOOK', source:'telegram', entityId:'synthetic-3', duplicateCount:1 },
  { type:'RECONCILIATION_MISMATCH', source:'ledger', entityId:'synthetic-4', expected:100, actual:99 },
  { type:'LOW_BALANCE', source:'vault', entityId:'synthetic-5', balance:9, threshold:10 },
] as const;

for (const c of cases) assert.ok(evaluateIncident(c as any, now), c.type + ' must trigger');
assert.equal(evaluateIncident({type:'SETTLEMENT_PENDING',source:'s',entityId:'x',pendingSince:'2026-10-05T08:51:00.000Z'}, now), null);
assert.equal(evaluateIncident({type:'RECONCILIATION_MISMATCH',source:'s',entityId:'x',expected:100,actual:100}, now), null);

const first = evaluateIncident(cases[2] as any, now)!;
const replay = evaluateIncident(cases[2] as any, now)!;
assert.equal(first.dedupeKey, replay.dedupeKey);

const raw:any = {...cases[0], botToken:'SECRET', bankAccount:'1234567890', personName:'PII'};
const safe = toOutboundIncident(evaluateIncident(raw, now)!);
assert.deepEqual(Object.keys(safe).sort(), ['dedupeKey','entityId','occurredAt','reason','severity','source','type'].sort());
assert.equal(JSON.stringify(safe).includes('SECRET'), false);
assert.equal(JSON.stringify(safe).includes('1234567890'), false);
assert.equal(JSON.stringify(safe).includes('PII'), false);
console.log('ACC-17 incident evaluator: PASS (5 triggers, negatives, dedupe, outbound allowlist)');
