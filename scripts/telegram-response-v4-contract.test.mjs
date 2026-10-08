import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatIntakeV4Reply, formatIntakeV4RichMessage } from '../runtime-patches/live-intake.mjs';

const response = readFileSync(new URL('../src/lib/ceVaultResponse.ts', import.meta.url), 'utf8');
const webhook = readFileSync(new URL('../app/api/telegram/webhook/route.ts', import.meta.url), 'utf8');

test('V4 keeps RECORDED distinct from DONE', () => {
  assert.match(response, /RECORDED:[\s\S]*IN:\s*'done'[\s\S]*DONE:\s*'pending'/);
  assert.match(response, /DONE:[\s\S]*DONE:\s*'done'/);
});

test('ALL CHECKS PASS requires explicit evidence', () => {
  assert.match(response, /data\.allChecksPass === true/);
  assert.doesNotMatch(response, /checks[^\n]*length[^\n]*=== 0[^\n]*ALL CHECKS PASS/);
});

test('missing financial fields render as dash instead of invented values', () => {
  assert.match(response, /n === null \|\| n === undefined/);
  assert.match(response, /'—'/);
});

test('keyboard is caller-supplied, real-action only, and capped at three', () => {
  assert.match(response, /type RealAction = 'dealok' \| 'dealedit' \| 'cancelop' \| 'edit' \| 'del'/);
  assert.match(response, /slice\(0, 3\)/);
  assert.doesNotMatch(response, /'OVERRIDE'|'FORCE_NEW'|'MANUAL_RATE'|'HOLD'|'SENT'/);
});

test('every response callback action has an implemented production handler', () => {
  for (const action of ['dealok', 'dealedit', 'cancelop', 'edit', 'del']) {
    assert.match(webhook, new RegExp(`action === ['"]${action}['"]`));
  }
});

test('ERROR never claims OCR failed by default', () => {
  const errorStart = response.indexOf('ERROR:');
  const errorEnd = response.indexOf('\n  },', errorStart);
  const block = response.slice(errorStart, errorEnd);
  assert.doesNotMatch(block, /OCR:\s*'failed'/);
  assert.match(block, /ตรวจ Ledger ก่อน retry/);
});

const renderPatch = readFileSync(new URL('./patch-live-intake.mjs', import.meta.url), 'utf8');
const renderHelper = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
const live = readFileSync(new URL('../src/lib/liveMessage.ts', import.meta.url), 'utf8');

test('V4 is wired into Next.js live cards and Render intake, with rollback', () => {
  assert.match(live, /buildV4Message/);
  assert.match(live, /buildV4Keyboard/);
  assert.match(live, /CE_RESPONSE_V4 !== '0'/);
  assert.match(renderPatch, /formatIntakeV4Reply, formatIntakeV4RichMessage/);
  assert.match(renderHelper, /useV4 \? formatIntakeV4RichMessage\(args\) : formatIntakeRichMessage\(args\)/);
  assert.match(renderHelper, /useV4 \? formatIntakeV4Reply\(args\) : formatIntakeReply\(args\)/);
});

test('Render V4 confirms checks only with explicit fresh market and pin evidence', () => {
  const base = {
    pending: { status: 'VERIFIED', ledger_ref: 'CE-1234', thb_in: '1000', should_send: '30.123456',
      pin_match: true, ocr_confidence: '98', bank: 'SCB', account_masked: '••••1234' },
    deskRate: { sell_rate: '33.20' }, market: { price: '33.1', fresh: true },
  };
  assert.match(formatIntakeV4Reply(base), /รอแอดมินอนุมัติ/);
  assert.doesNotMatch(formatIntakeV4Reply({ ...base, market: { price: '33.1', fresh: false } }), /ALL CHECKS PASS/);
  assert.doesNotMatch(formatIntakeV4Reply({ ...base, pending: { ...base.pending, pin_match: false } }), /ALL CHECKS PASS/);
  assert.match(formatIntakeV4Reply(base), /30.123456/);
});

test('Render V4 does not settle a recorded deal and blocks duplicate replay claims', () => {
  const pending = { status: 'RECORDED', ledger_ref: 'CE-88aa', tx_id: 'tx-001', thb_in: '2000', pin_match: true };
  const recorded = formatIntakeV4Reply({ pending, recorded: { tx_id: 'tx-001' } });
  assert.match(recorded, /บันทึก IN แล้ว · WAIT USDT/);
  assert.match(recorded, /IN ✓ → WAIT ⏳ → DONE —/);
  assert.doesNotMatch(recorded, /ALL CHECKS PASS/);
  const duplicate = formatIntakeV4Reply({ pending, duplicate: true });
  assert.match(duplicate, /สลิปซ้ำ/);
  assert.doesNotMatch(duplicate, /บันทึก THB แล้ว ยังไม่ SETTLED/);
});

test('Render V4 rich message escapes untrusted slip text', () => {
  const rich = formatIntakeV4RichMessage({
    pending: { status: 'BANK_MISMATCH', bank: '<script>alert(1)</script>', ledger_ref: 'CE-01' },
  });
  assert.doesNotMatch(rich.html, /<script>/);
  assert.doesNotMatch(rich.html, /alert\(1\)/);
  assert.match(rich.html, /<details/);
});


const transactionService = readFileSync(new URL('../src/lib/transactions.ts', import.meta.url), 'utf8');
const deleteRpcGuard = readFileSync(new URL('../supabase/patch-v10b-delete-settlement-guard.sql', import.meta.url), 'utf8');

test('DELETE on RECORDED or WAITING is rejected before destructive callback and missing status fails closed', () => {
  const callback = webhook.slice(webhook.indexOf("  const txId = arg;"));
  assert.match(callback, /if \(action === 'del'\) \{[\s\S]*?getTransactionStatus\(txId\)/);
  assert.match(callback, /if \(status !== 'completed'\)/);
  assert.match(callback, /รายการยังไม่ SETTLED ห้ามลบ/);
  assert.match(callback, /ตรวจสอบสถานะไม่ได้ ไม่ลบรายการ/);
  const guardedRead = callback.indexOf('await getTransactionStatus(txId)');
  const destructiveDelete = callback.indexOf('await deleteTransaction(txId)');
  assert.ok(guardedRead >= 0 && destructiveDelete > guardedRead, 'preflight must precede delete');
});

test('Ledger service only allows completed and RPC checks atomically under row lock', () => {
  const deleteService = transactionService.slice(transactionService.indexOf('export async function deleteTransaction('));
  assert.match(deleteService, /if \(old\.status !== 'completed'\) throw new Error\('TX_NOT_SETTLED'\)/);
  assert.match(deleteService, /const \{ holding \} = await rpcDelete\(txId\)/);
  assert.match(transactionService, /export async function getTransactionStatus\(txId: string\)/);
  assert.match(deleteRpcGuard, /select \* into v_old from public\.transactions where id = p_tx_id for update;/i);
  assert.match(deleteRpcGuard, /if v_old\.status is distinct from 'completed' then\s+raise exception 'TX_NOT_SETTLED';/i);
  assert.match(deleteRpcGuard, /delete from public\.transactions where id = p_tx_id;/i);
  assert.match(deleteRpcGuard, /revoke execute on function public\.ce_delete_transaction\(uuid\) from public, anon, authenticated;/i);
});

test('V4 keeps real edit/delete callback names and completed delete path', () => {
  const callback = webhook.slice(webhook.indexOf('  const txId = arg;'));
  assert.match(callback, /if \(action === 'edit'\) \{/);
  assert.match(callback, /else if \(action === 'del'\) \{/);
  assert.match(callback, /const r = await deleteTransaction\(txId\)/);
  assert.match(callback, /TX_NOT_SETTLED/);
});

test('RECORDED cards cannot offer DELETE while completed cards retain the protected path', () => {
  const recordedCard = live.slice(live.indexOf('export function liveRecorded('), live.indexOf('export function liveSettled('));
  const settledCard = live.slice(live.indexOf('export function liveSettled('), live.indexOf('export function liveError('));
  assert.doesNotMatch(recordedCard, /id: 'del'/);
  assert.doesNotMatch(recordedCard, /callback_data: `del:/);
  assert.match(settledCard, /callback_data: `del:/);
});

test('room reset cannot bypass the completed-only RPC via direct table delete', () => {
  const resetService = transactionService.slice(transactionService.indexOf('export async function resetRoom('), transactionService.indexOf('export interface RoomStat'));
  assert.match(resetService, /RESET_ROOM_HARD_DELETE_DISABLED/);
  assert.doesNotMatch(resetService, /\.delete\s*\(/);
  const resetCallback = webhook.slice(webhook.indexOf("if (action === 'resetgo')"), webhook.indexOf('const txId = arg;'));
  assert.match(resetCallback, /ปิด RESET แบบลบข้อมูล/);
  assert.doesNotMatch(resetCallback, /resetRoom\(chatId\)/);
});

test('database deletion guard retains hardened SQL function attributes', () => {
  assert.match(deleteRpcGuard, /security invoker/i);
  assert.match(deleteRpcGuard, /set search_path = public, pg_temp/i);
});


test('low confidence 80% shows exactly one actionable CHECKS issue', () => {
  const args = {
    pending: { status: 'NEEDS_REVIEW', ledger_ref: 'CE-TX-2460', thb_in: '1000', should_send: '26.94',
      ocr_confidence: 80, bank: 'SCB', account_masked: '••••3114', pin_match: false },
    deskRate: { sell_rate: '37.12' }, market: { price: '37.10', fresh: true },
  };
  const rich = formatIntakeV4RichMessage(args).html;
  const plain = formatIntakeV4Reply(args);
  assert.match(rich, /OCR 80% ต่ำกว่าเกณฑ์ 90%/);
  assert.equal((rich.match(/<p>⚠️ /g) || []).length, 1);
  assert.doesNotMatch(rich, /ISSUE:|OCR confidence หรือข้อมูลสลิปต้องตรวจเพิ่ม/);
  assert.doesNotMatch(plain, /ISSUE:/);
  assert.match(plain, /NEXT:/);
});


test('Telegram five-stage reply never promotes a review or recorded slip to DONE', () => {
  const base = { pending: { ledger_ref: 'CE-TX-2460', status: 'NEEDS_REVIEW', thb_in: '1000',
    should_send: '26.940000', ocr_confidence: 80, bank: 'SCB', account_masked: '••••3114', pin_match: false },
    deskRate: { sell_rate: '37.12' }, market: { price: '37.10', fresh: true } };
  const review = formatIntakeV4Reply(base);
  assert.match(review, /OCR ✓ → REVIEW ⏳ → IN —/);
  assert.doesNotMatch(review, /IN ✓|DONE ✓/);
  const recorded = formatIntakeV4Reply({ ...base, pending: { ...base.pending, status: 'RECORDED', pin_match: true, ocr_confidence: 98, tx_id: 'tx-1' }, recorded: { tx_id: 'tx-1' } });
  assert.match(recorded, /OCR ✓ → MATCH ✓ → IN ✓ → WAIT ⏳ → DONE —/);
  assert.doesNotMatch(recorded, /DONE ✓|SETTLED ✓/);
  const mismatch = formatIntakeV4Reply({ ...base, pending: { ...base.pending, status: 'BANK_MISMATCH' } });
  assert.match(mismatch, /MATCH ✗ → IN —/);
  const failed = formatIntakeV4Reply({ ...base, pending: { ...base.pending, status: 'OCR_FAILED' } });
  assert.match(failed, /OCR ✗ → MATCH —/);
});

test('bilingual financial summary does not invent settlement from OCR', () => {
  const pending = { status: 'RECORDED', tx_id: 'tx-1', ledger_ref: 'CE-1', thb_in: '1000',
    should_send: '26.94', account_number: '1234567890', bank: 'SCB' };
  const base = { pending, recorded: { tx_id: 'tx-1' }, deskRate: { sell_rate: '37.12' } };
  const card = formatIntakeV4Reply(base);
  assert.match(card, /ต้องส่ง \(Due\): 26.94 USDT/);
  assert.match(card, /ส่งยืนยันแล้ว \(Cleared\): — USDT/);
  assert.match(card, /ค้างส่ง \(Outstanding\): — USDT/);
  assert.doesNotMatch(card, /1234567890/);
  const paid = formatIntakeV4Reply({ ...base, recorded: { tx_id: 'tx-1', settlement_verified: true, cleared_usdt: '10.00' } });
  assert.match(paid, /ส่งยืนยันแล้ว \(Cleared\): 10.00 USDT/);
  assert.match(paid, /ค้างส่ง \(Outstanding\): 16.94 USDT/);
  const unverified = formatIntakeV4Reply({ ...base, recorded: { tx_id: 'tx-1', cleared_usdt: '10.00' } });
  assert.match(unverified, /ส่งยืนยันแล้ว \(Cleared\): — USDT/);
});

test('OCR remains visible and only explicit admin approval promotes', () => {
  const helper = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  const patch = readFileSync(new URL('../scripts/patch-live-intake.mjs', import.meta.url), 'utf8');
  const imageHandler = helper.slice(helper.indexOf('async function handleLiveSlipMessage('));
  assert.equal(imageHandler.includes('repository.promotePendingSlip('), false);
  assert.ok(helper.includes('async function handleTelegramApprove('));
  assert.ok(helper.includes('pending.status !== "VERIFIED"'));
  assert.ok(helper.includes('repository.promotePendingSlip(pending.id, operator.id'));
  assert.ok(patch.includes('handleTelegramApprove(message)'));
  assert.ok(patch.includes('getPendingSlipForApproval(id)'));
  const card = formatIntakeV4Reply({ pending: {
    id: '00000000-0000-0000-0000-000000000001', status: 'VERIFIED',
    ledger_ref: 'CE-1', thb_in: '1000', ocr_confidence: '98',
    note: 'OCR=typhoon;SLIP_DATE=08/10/26;SLIP_TIME=13:30',
  } });
  assert.ok(card.includes('รอแอดมินอนุมัติ'));
  assert.ok(card.includes('08/10/26 13:30'));
  assert.ok(card.includes('Confidence: 98.0%'));
  assert.ok(card.includes('/approve 00000000-0000-0000-0000-000000000001'));
});

test('Telegram callbacks require real pending UUIDs and route through server-side operator checks', () => {
  const helper = readFileSync(new URL('../runtime-patches/server-intake-helpers.txt', import.meta.url), 'utf8');
  const patch = readFileSync(new URL('../scripts/patch-live-intake.mjs', import.meta.url), 'utf8');
  assert.ok(helper.includes('args?.pending?.status === "VERIFIED"'));
  assert.ok(helper.includes('callback_data: "ce:approve:" + id'));
  assert.ok(helper.includes('callback_data: "ce:reject:" + id'));
  assert.ok(helper.includes('callback_data: "ce:edit:" + id'));
  assert.ok(helper.includes('return handleTelegramApprove(message)'));
  assert.ok(helper.includes('return handleTelegramReject(message)'));
  assert.ok(helper.includes('return handleTelegramEdit(message)'));
  assert.ok(helper.includes('const operator = await requireTelegramOperator(message)'));
  assert.ok(helper.includes('String(pending.chat_id) !== String(message.chat.id)'));
  assert.ok(helper.includes('result.reused'));
  assert.ok(patch.includes('rejectVerifiedPendingSlip(id, chatId, telegramUserId)'));
  assert.ok(patch.includes('.eq("status", "VERIFIED")'));
  assert.ok(patch.includes('.is("tx_id", null)'));
  assert.ok(patch.includes('handleTelegramReject(message)'));
  assert.ok(patch.includes('handleTelegramEdit(message)'));
});

test('compact OCR card does not leak full OCR document into bank field', () => {
  const badBank = 'โอนเงินสำเร็จข้อมูลการโอนวันที่02ตค25691943รหัสอ้างอิง202610021BOUSCDOYHHT1YMM4จำนวนเงิน500ผู้รับเงิน';
  const card = formatIntakeV4Reply({pending:{
    status:'STALE_SLIP', bank:badBank, account_masked:'••••5629',
    thb_in:'5',should_send:'0.130000',desk_rate:'37.12',
    note:'OCR=typhoon_ocr_1_5;SLIP_DATE=02/10/2569;SLIP_TIME=19:43',
    ocr_confidence:'90',
  }});
  assert.ok(card.includes('วันที่สลิปไม่ตรง'));
  assert.ok(card.includes('บัญชีรับ: ไม่ยืนยัน'));
  assert.ok(!card.includes('BOUSCDOYHHT1YMM4'));
  assert.ok(card.includes('💎 ประเมิน (USDT): 0.130000'));
  assert.ok(card.includes('📊 ต้องส่ง (Due): — USDT'));
  assert.ok(card.includes('Confidence: 90.0%'));
  assert.ok(!card.includes('OCR Confidence): 90.0%'));
});
