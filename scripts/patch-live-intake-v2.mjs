import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
const sourcePath = path.join(scriptsDir, 'patch-live-intake.mjs');
const generatedPath = path.join(scriptsDir, '.patch-live-intake.generated.mjs');
let source = readFileSync(sourcePath, 'utf8');

const startMarker = 'const intakeHelpers = String.raw`';
const tailMarker = "\nserver = replaceOnce(server, '\\nasync function processTelegramUpdate(update) {'";
const start = source.indexOf(startMarker);
const tail = source.indexOf(tailMarker, start);
if (start < 0 || tail < 0) throw new Error('LIVE_INTAKE_V2_TEMPLATE_BOUNDARY_NOT_FOUND');

source = source.slice(0, start)
  + "const intakeHelpers = readFileSync(path.join(root, 'runtime-patches', 'server-intake-helpers.txt'), 'utf8');\n"
  + source.slice(tail + 1);

writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);

  // Harden Thai slip date parsing: two-digit Thai Buddhist shorthand such as 69 means 2569 -> 2026.
  const runtimePath = path.join(root, 'appsrc', 'server', 'live-intake.mjs');
  let runtime = readFileSync(runtimePath, 'utf8');
  const oldYearLogic = '  let year = Number(match[3]);\n  if (year < 100) year += 2000;\n  if (year > 2400) year -= 543;';
  const newYearLogic = '  const rawYear = String(match[3]);\n  let year = Number(rawYear);\n  if (rawYear.length === 2) year = year >= 40 ? year + 1957 : year + 2000;\n  if (rawYear.length === 4 && year > 2400) year -= 543;';
  if (!runtime.includes(oldYearLogic)) throw new Error('LIVE_INTAKE_YEAR_LOGIC_NOT_FOUND');
  runtime = runtime.replace(oldYearLogic, newYearLogic);
  writeFileSync(runtimePath, runtime);

  // Manual review module is copied into the generated runtime as a sibling of live-intake.mjs.
  const manualReviewSource = path.join(root, 'runtime-patches', 'manual-review.mjs');
  const manualReviewTarget = path.join(root, 'appsrc', 'server', 'manual-review.mjs');
  writeFileSync(manualReviewTarget, readFileSync(manualReviewSource, 'utf8'));

  // Repository support for lookup + one atomic manual-review promotion RPC.
  const repositoryPath = path.join(root, 'appsrc', 'server', 'repositories', 'supabase.mjs');
  let repository = readFileSync(repositoryPath, 'utf8');
  const repoAnchor = '    async listOpsTransactions(limit = 1000) {';
  const repoMethods = `    async getPendingSlipByLedgerRef(ledgerRef) {\n      return ensureData(await db.from("pending_slips")\n        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint,bank_account_id,note")\n        .eq("ledger_ref", ledgerRef)\n        .limit(1)\n        .maybeSingle());\n    },\n    async promoteManualReviewedSlip({ pendingId, adminId, bankAccountId, roomName, amount, bank, last4, marketRate, marketObservedAt }) {\n      const data = ensureData(await db.rpc("ce_promote_manual_reviewed_slip", {\n        p_pending_id: pendingId,\n        p_admin_id: adminId,\n        p_bank_account_id: bankAccountId,\n        p_room_name: roomName || null,\n        p_thb_amount: amount,\n        p_bank_code: bank,\n        p_last4: last4,\n        p_market_rate: marketRate,\n        p_market_observed_at: marketObservedAt,\n      }));\n      const row = Array.isArray(data) ? data[0] : data;\n      if (!row?.tx_id) throw asRepositoryError({ message: "MANUAL_REVIEW_RETURNED_NO_TRANSACTION" }, "MANUAL_REVIEW_PROMOTION_FAILED");\n      return row;\n    },\n${repoAnchor}`;
  if (!repository.includes(repoAnchor)) throw new Error('MANUAL_REVIEW_REPOSITORY_ANCHOR_NOT_FOUND');
  repository = repository.replace(repoAnchor, repoMethods);
  writeFileSync(repositoryPath, repository);

  // Wire the operator-only /review command into the generated Telegram runtime.
  const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');
  let server = readFileSync(serverPath, 'utf8');
  const importAnchor = 'import { accountLast4, analyzeSlipBuffer, bangkokDateKey, decideIntake, divideDecimal, fetchBinanceThSpot, findPinnedMatch, fingerprintImage, formatIntakeReply, intakeCapability, makeLedgerIdentity, normalizeBank } from "./live-intake.mjs";';
  if (!server.includes(importAnchor)) throw new Error('MANUAL_REVIEW_IMPORT_ANCHOR_NOT_FOUND');
  server = server.replace(importAnchor, `${importAnchor}\nimport { parseManualReviewCommand, validateManualReviewGate } from "./manual-review.mjs";`);

  const processAnchor = '\nasync function processTelegramUpdate(update) {';
  const handler = `\nasync function handleTelegramManualReview(message) {\n  const operator = await requireTelegramOperator(message);\n  if (!operator) return true;\n  const chatId = message.chat.id;\n  let command;\n  try {\n    command = parseManualReviewCommand(message.text || "");\n  } catch (error) {\n    await telegram.sendMessage(chatId, [\n      "CE VAULT · REVIEW INVALID",\n      error?.code || error?.message || "MANUAL_REVIEW_FORMAT_INVALID",\n      "ใช้ /review REF AMOUNT BANK LAST4",\n    ].join("\\n"));\n    return true;\n  }\n\n  const pending = await repository.getPendingSlipByLedgerRef(command.ledgerRef);\n  const businessDate = bangkokDateKey();\n  const [deskRate, pinnedBanks, market] = await Promise.all([\n    repository.getLatestDeskRate(),\n    repository.listPinnedBanksForDate(businessDate),\n    fetchBinanceThSpot().catch(() => null),\n  ]);\n  const gate = validateManualReviewGate({\n    pending,\n    bank: command.bank,\n    last4: command.last4,\n    pinnedBanks,\n    deskRate,\n    market,\n  });\n  if (!gate.ok) {\n    await telegram.sendMessage(chatId, [\n      "CE VAULT · REVIEW BLOCKED",\n      \`REF \${command.ledgerRef}\`,\n      gate.code,\n    ].join("\\n"));\n    return true;\n  }\n\n  try {\n    const recorded = await repository.promoteManualReviewedSlip({\n      pendingId: pending.id,\n      adminId: operator.id,\n      bankAccountId: gate.pinnedMatch.id,\n      roomName: roomNameFor(message),\n      amount: command.amount,\n      bank: command.bank,\n      last4: command.last4,\n      marketRate: market.price,\n      marketObservedAt: market.observed_at,\n    });\n    const shouldSend = divideDecimal(command.amount, String(recorded.desk_rate || deskRate.sell_rate), 6);\n    const finalPending = {\n      ...pending,\n      status: "RECORDED",\n      thb_in: command.amount,\n      should_send: shouldSend,\n      desk_rate: String(recorded.desk_rate || deskRate.sell_rate),\n      mkt_rate: String(market.price),\n      bank: command.bank,\n      account_masked: \`••••\${command.last4}\`,\n      pin_match: true,\n      tx_id: recorded.tx_id,\n    };\n    publishSse("activity", { type: "manual_review_intake", transaction_id: recorded.tx_id, ledger_ref: command.ledgerRef });\n    await telegram.sendMessage(chatId, [\n      formatIntakeReply({ pending: finalPending, market, deskRate: { sell_rate: finalPending.desk_rate }, recorded }),\n      "SOURCE MANUAL_REVIEW · OCR confidence ไม่ถูกปลอม",\n    ].join("\\n"));\n  } catch (error) {\n    await telegram.sendMessage(chatId, [\n      "CE VAULT · REVIEW FAILED",\n      \`REF \${command.ledgerRef}\`,\n      error?.code || error?.message || "MANUAL_REVIEW_PROMOTION_FAILED",\n    ].join("\\n"));\n  }\n  return true;\n}\n`;
  if (!server.includes(processAnchor)) throw new Error('MANUAL_REVIEW_PROCESS_ANCHOR_NOT_FOUND');
  server = server.replace(processAnchor, `${handler}${processAnchor}`);

  const routerAnchor = '  const message = update.message;\n  if (message?.chat?.id && /^\\/rate(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {';
  const routerReplacement = '  const message = update.message;\n  if (message?.chat?.id && /^\\/review(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramManualReview(message);\n    return;\n  }\n  if (message?.chat?.id && /^\\/rate(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {';
  if (!server.includes(routerAnchor)) throw new Error('MANUAL_REVIEW_ROUTER_ANCHOR_NOT_FOUND');
  server = server.replace(routerAnchor, routerReplacement);
  writeFileSync(serverPath, server);

  // Correct the financial fixture. The runtime BigInt decimal division was already correct.
  const testPath = path.join(root, 'appsrc', 'tests', 'live-intake.test.mjs');
  let testSource = readFileSync(testPath, 'utf8');
  if (!testSource.includes('26937.194045')) throw new Error('LIVE_INTAKE_DECIMAL_FIXTURE_NOT_FOUND');
  testSource = testSource.replace('26937.194045', '26937.188135');
  writeFileSync(testPath, testSource);
} finally {
  try { unlinkSync(generatedPath); } catch {}
}
