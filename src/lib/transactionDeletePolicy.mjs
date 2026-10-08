// CE VAULT deletion is permitted only for transactions completed in the ledger.
// UI labels (RECORDED, WAIT, DONE) are not authoritative database statuses.
export const DELETE_BLOCKED_MESSAGE = '⛔ รายการยังไม่ SETTLED ห้ามลบ — ติดต่อปิดรายการก่อน';

export function assertTransactionDeleteAllowed(status) {
  if (status !== 'completed') {
    const error = new Error(DELETE_BLOCKED_MESSAGE);
    error.code = 'TX_NOT_SETTLED';
    throw error;
  }
}
