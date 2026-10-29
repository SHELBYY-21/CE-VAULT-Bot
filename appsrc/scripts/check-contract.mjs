import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const expectedStates = ['IDLE','SCANNING','OCR_EXTRACTING','VERIFYING','NEED_CONFIRMATION','PROCESSING','WAITING','SETTLING','COMPLETED','FAILED','DUPLICATE','TIMEOUT'];
const expectedFlow = 'SCAN→OCR→VERIFY→CONFIRM→PROCESS→SETTLEMENT→DONE';

for (const state of expectedStates) {
  if (!source.includes(`"${state}"`)) throw new Error(`Missing canonical state: ${state}`);
}
if ((source.match(/const CANONICAL_STATES/g) || []).length !== 1) throw new Error('Canonical state list must have one source of truth');
if (!source.includes(expectedFlow)) throw new Error('Canonical seven-stage flow changed');
if (!source.includes('const LIVE_SETTLEMENT_ENABLED = false')) throw new Error('Live settlement guard missing');
for (const terminal of ['COMPLETED','FAILED','DUPLICATE','TIMEOUT']) {
  if (!source.includes(terminal)) throw new Error(`Terminal state missing: ${terminal}`);
}
for (const forbidden of ['force_process', 'skip_duplicate', 'approve_anyway']) {
  if (source.includes(forbidden)) throw new Error(`Forbidden bypass action present: ${forbidden}`);
}
console.log(`contract smoke check: ${expectedStates.length} states, ${expectedFlow.split('→').length} stages, live flag false`);
