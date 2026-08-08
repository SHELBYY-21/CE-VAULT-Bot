const { parseSlipText, computeShouldSend } = require('../src/bot/parse');
const { GET, POST } = require('../app/api/hooks/route');
const { NextRequest } = require('next/server');

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`FAIL: ${msg}`);
  }
  console.log(`PASS: ${msg}`);
}

async function assertJsonResponse(res: any, expectedStatus: number, expectedKey: string, expectedValue: any, msg: string) {
  assert(res.status === expectedStatus, `${msg} status (${res.status})`);
  const data = await res.json();
  assert(data[expectedKey] === expectedValue, `${msg} ${expectedKey} (${data[expectedKey]})`);
}

console.log('🧪 Running parse tests...');

const t1 = parseSlipText('ยอด 5,000 บาท ธนาคาร CIMB 2330 วันที่ 24/07/26 ผู้รับ นางสาว อัญยา ระดาบุตร');
assert(t1.amount === 5000, `amount 5000 (got ${t1.amount})`);
assert(t1.bank === 'CIMB', `bank CIMB (got ${t1.bank})`);
assert(t1.last4 === '2330', `last4 2330 (got ${t1.last4})`);
assert(t1.receiverName === 'อัญยา ระดาบุตร', `receiverName อัญยา ระดาบุตร (got ${t1.receiverName})`);
assert(t1.date === '24/07/26', `date 24/07/26 (got ${t1.date})`);

const t2 = parseSlipText('โอนสำเร็จ 12,500.50 THB ธนาคาร KBANK xxxx1234 เวลา 14:30');
assert(t2.amount === 12500.5, `amount 12500.5 (got ${t2.amount})`);
assert(t2.bank === 'KBANK', `bank KBANK (got ${t2.bank})`);
assert(t2.last4 === '1234', `last4 1234 (got ${t2.last4})`);
assert(t2.time === '14:30', `time 14:30 (got ${t2.time})`);

assert(computeShouldSend(5000, 42) === 119.05, `computeShouldSend(5000, 42) = 119.05 (got ${computeShouldSend(5000, 42)})`);
assert(computeShouldSend(1000, 35.5) === 28.17, `computeShouldSend(1000, 35.5) = 28.17 (got ${computeShouldSend(1000, 35.5)})`);
assert(computeShouldSend(0, 35.5) === 0, `computeShouldSend(0, 35.5) = 0`);

console.log('🧪 Running hook endpoint tests...');

(async () => {
  const getRes = await GET(new NextRequest('http://localhost:3000/api/hooks'));
  await assertJsonResponse(getRes, 200, 'ok', true, 'GET /api/hooks');

  const postRes = await POST(
    new NextRequest('http://localhost:3000/api/hooks', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hook-event': 'deposit.received' },
      body: JSON.stringify({ event: 'deposit.received', payload: { id: 'abc123' } }),
    }),
  );
  await assertJsonResponse(postRes, 202, 'received', true, 'POST /api/hooks');
})();

console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
