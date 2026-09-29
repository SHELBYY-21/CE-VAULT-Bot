/**
 * Pure validation guard for ledger rate writes.
 *
 * Rationale: an env fallback like Number(process.env.DEFAULT_MARKET_RATE)
 * evaluates to NaN (never null/undefined), so a `?? default` upstream is
 * dead code. The ledger must fail closed instead of persisting NaN into
 * financial rate history. See docs/QA-E2E-REAL-STATUS.md.
 */
export function assertFiniteRate(value: number, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Invalid rate (${field}): expected a finite number`);
  }
  return value;
}
