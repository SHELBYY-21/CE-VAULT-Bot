import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appRoot = path.join(root, 'appsrc');
const serverPath = path.join(appRoot, 'server', 'index.mjs');
const repositoryPath = path.join(appRoot, 'server', 'repositories', 'supabase.mjs');
const telegramPath = path.join(appRoot, 'server', 'repositories', 'telegram.mjs');
const opsSummaryPath = path.join(appRoot, 'server', 'ops-summary.mjs');
const runtimeTemplatePath = path.join(root, 'runtime-patches', 'live-intake.mjs');
const runtimeTargetPath = path.join(appRoot, 'server', 'live-intake.mjs');
const testsPath = path.join(appRoot, 'tests');

function replaceOnce(source, needle, replacement, code) {
  if (!source.includes(needle)) throw new Error(code);
  return source.replace(needle, replacement);
}

mkdirSync(testsPath, { recursive: true });
writeFileSync(runtimeTargetPath, readFileSync(runtimeTemplatePath, 'utf8'));

// Telegram: server-side file download only. Bot token never leaves the server or gets persisted.
let telegram = readFileSync(telegramPath, 'utf8');
telegram = replaceOnce(
  telegram,
  'export function createTelegramClient(token) {',
  `function telegramFileMime(filePath) {\n  const lower = String(filePath || "").toLowerCase();\n  if (lower.endsWith(".png")) return "image/png";\n  if (lower.endsWith(".webp")) return "image/webp";\n  return "image/jpeg";\n}\n\nexport function createTelegramClient(token) {`,
  'LIVE_INTAKE_TELEGRAM_HELPER_ANCHOR_NOT_FOUND',
);
telegram = replaceOnce(
  telegram,
  '  return Object.freeze({\n    getWebhookInfo() {',
  `  return Object.freeze({\n    sendMessageWithMarkup(chatId, text, replyMarkup) {\n      return telegramRequest(token, "sendMessage", { chat_id: chatId, text, reply_markup: replyMarkup });\n    },\n    answerCallbackQuery(callbackQueryId, text) {\n      return telegramRequest(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });\n    },\n    async downloadFile(fileId) {\n      const meta = await telegramRequest(token, "getFile", { file_id: fileId });\n      if (!meta?.file_path) {\n        const error = new Error("TELEGRAM_FILE_UNAVAILABLE");\n        error.code = "TELEGRAM_FILE_UNAVAILABLE";\n        throw error;\n      }\n      if (Number(meta.file_size || 0) > 8 * 1024 * 1024) {\n        const error = new Error("TELEGRAM_FILE_TOO_LARGE");\n        error.code = "TELEGRAM_FILE_TOO_LARGE";\n        throw error;\n      }\n      const response = await fetch(\`${'${API_ROOT}'}/file/bot${'${token}'}/${'${meta.file_path}'}\`, { signal: AbortSignal.timeout(10_000) });\n      if (!response.ok) {\n        const error = new Error("TELEGRAM_FILE_UNAVAILABLE");\n        error.code = "TELEGRAM_FILE_UNAVAILABLE";\n        throw error;\n      }\n      const buffer = Buffer.from(await response.arrayBuffer());\n      return { buffer, filePath: meta.file_path, mimeType: telegramFileMime(meta.file_path) };\n    },\n    getWebhookInfo() {`,
  'LIVE_INTAKE_TELEGRAM_CLIENT_ANCHOR_NOT_FOUND',
);
writeFileSync(telegramPath, telegram);

// Supabase repository: operational intake primitives. All writes stay server-side.
let repository = readFileSync(repositoryPath, 'utf8');
const repoAnchor = '  return Object.freeze({\n    async listOpsTransactions(limit = 1000) {';
const repoMethods = String.raw`  return Object.freeze({
    async getOperatorByTelegramId(telegramUserId) {
      return ensureData(await db.from("admins")
        .select("id,name,role,is_active")
        .eq("telegram_user_id", String(telegramUserId))
        .eq("is_active", true)
        .maybeSingle());
    },
    async getLatestDeskRate() {
      return ensureData(await db.from("rates")
        .select("sell_rate,created_at")
        .gt("sell_rate", 0)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle());
    },
    async insertDeskRate(adminId, sellRate, marketRate) {
      return ensureData(await db.from("rates")
        .insert({ sell_rate: sellRate, market_usdt_rate: marketRate, set_by_admin_id: adminId })
        .select("sell_rate,market_usdt_rate,created_at")
        .single());
    },
    async listPinnedBanksForDate(dateKey) {
      return ensureData(await db.from("bank_accounts")
        .select("id,label,bank_name,account_number,pinned_for_date")
        .eq("pinned_for_date", dateKey)
        .order("updated_at", { ascending: false })
        .limit(20));
    },
    async listBankAccountsForPin() {
      return ensureData(await db.from("bank_accounts")
        .select("id,label,bank_name,account_number,pinned_for_date")
        .order("updated_at", { ascending: false })
        .limit(50));
    },
    async pinBankForDate(id, dateKey) {
      return ensureData(await db.from("bank_accounts")
        .update({ pinned_for_date: dateKey, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,label,bank_name,account_number,pinned_for_date")
        .single());
    },
    async unpinBankForDate(id, dateKey) {
      return ensureData(await db.from("bank_accounts")
        .update({ pinned_for_date: null, updated_at: new Date().toISOString() })
        .eq("id", id)
        .eq("pinned_for_date", dateKey)
        .select("id,label,bank_name,account_number,pinned_for_date")
        .maybeSingle());
    },
    async findIntakeDuplicate(fingerprint) {
      const pending = ensureData(await db.from("pending_slips")
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,tx_id,slip_fingerprint")
        .eq("slip_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle());
      if (pending) return { source: "pending_slips", ...pending };
      const transaction = ensureData(await db.from("transactions")
        .select("id,ledger_ref,status,thb_amount,expected_usdt,slip_fingerprint")
        .eq("slip_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle());
      return transaction ? { source: "transactions", ...transaction } : null;
    },
    async createPendingSlip(row) {
      const result = await db.from("pending_slips")
        .insert(row)
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint")
        .single();
      if (!result.error) return { ...result.data, duplicate: false };
      if (result.error.code === "23505") {
        const existing = ensureData(await db.from("pending_slips")
          .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint")
          .eq("slip_fingerprint", row.slip_fingerprint)
          .limit(1)
          .maybeSingle());
        if (existing) return { ...existing, duplicate: true };
      }
      throw asRepositoryError(result.error, "PENDING_SLIP_CREATE_FAILED");
    },
    async updatePendingSlip(id, patch) {
      return ensureData(await db.from("pending_slips")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select("id,ledger_ref,status,thb_in,should_send,desk_rate,mkt_rate,bank,account_masked,pin_match,ocr_confidence,tx_id,slip_fingerprint")
        .single());
    },
    async promotePendingSlip(pendingId, adminId, roomName) {
      const data = ensureData(await db.rpc("ce_promote_pending_slip", {
        p_pending_id: pendingId,
        p_admin_id: adminId,
        p_room_name: roomName || null,
      }));
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.tx_id) throw asRepositoryError({ message: "PROMOTION_RETURNED_NO_TRANSACTION" }, "PROMOTION_FAILED");
      return row;
    },
    async listOpsTransactions(limit = 1000) {`;
repository = replaceOnce(repository, repoAnchor, repoMethods, 'LIVE_INTAKE_REPOSITORY_ANCHOR_NOT_FOUND');
repository = repository.replace(
  'async listOpsRates() {\n      return ensureData(await db.from("rates")\n        .select("sell_rate,market_usdt_rate,created_at")\n        .order("created_at", { ascending: false })\n        .limit(1));\n    },',
  'async listOpsRates() {\n      return ensureData(await db.from("rates")\n        .select("sell_rate,market_usdt_rate,created_at")\n        .gt("sell_rate", 0)\n        .order("created_at", { ascending: false })\n        .limit(1));\n    },',
);
writeFileSync(repositoryPath, repository);

// Board read model: market is live Binance TH spot; DB market is only a labeled stale snapshot fallback.
let opsSummary = readFileSync(opsSummaryPath, 'utf8');
opsSummary = replaceOnce(
  opsSummary,
  '  exceptions = [],\n  now = new Date().toISOString(),',
  '  exceptions = [],\n  market = null,\n  now = new Date().toISOString(),',
  'LIVE_INTAKE_OPS_SUMMARY_ARGS_NOT_FOUND',
);
opsSummary = replaceOnce(
  opsSummary,
  `    rate: latestRate ? {\n      sell_rate: String(latestRate.sell_rate ?? '0'),\n      market_usdt_rate: String(latestRate.market_usdt_rate ?? '0'),\n      created_at: latestRate.created_at,\n    } : null,`,
  `    rate: (latestRate || market) ? {\n      sell_rate: String(latestRate?.sell_rate ?? '0'),\n      market_usdt_rate: market?.price ? String(market.price) : String(latestRate?.market_usdt_rate ?? '0'),\n      market_source: market?.fresh ? 'BINANCE_TH_SPOT' : 'STALE_DB_SNAPSHOT',\n      market_observed_at: market?.observed_at ?? null,\n      created_at: latestRate?.created_at ?? null,\n    } : null,`,
  'LIVE_INTAKE_OPS_SUMMARY_RATE_BLOCK_NOT_FOUND',
);
writeFileSync(opsSummaryPath, opsSummary);

let server = readFileSync(serverPath, 'utf8');
server = replaceOnce(
  server,
  'import { buildOpsOverview } from "./ops-summary.mjs";',
  'import { buildOpsOverview } from "./ops-summary.mjs";\nimport { accountLast4, analyzeSlipBuffer, bangkokDateKey, decideIntake, divideDecimal, fetchBinanceThSpot, findPinnedMatch, fingerprintImage, botHomeReplyMarkup, formatBotHomeReply, formatBotSystemReply, formatIntakeReply, formatScanStageReply, intakeCapability, makeLedgerIdentity, normalizeBank } from "./live-intake.mjs";',
  'LIVE_INTAKE_SERVER_IMPORT_ANCHOR_NOT_FOUND',
);

const intakeHelpers = readFileSync(path.join(root, 'runtime-patches', 'server-intake-helpers.txt'), 'utf8');
server = replaceOnce(server, '\nasync function processTelegramUpdate(update) {', `${intakeHelpers}\nasync function processTelegramUpdate(update) {`, 'LIVE_INTAKE_PROCESS_ANCHOR_NOT_FOUND');

const messageAnchor = '  const message = update.message;\n  if (message?.chat?.type === "private" && /^\\/sandbox(?:\\s|$)/i.test(message.text || "")) {';
const messageRouter = `  const ceCallback = update.callback_query;\n  if (ceCallback?.message?.chat?.id && /^ce:/.test(String(ceCallback.data || ""))) {\n    await handleTelegramCallback(ceCallback);\n    return;\n  }\n  const message = update.message;\n  if (message?.chat?.id && /^\\/(?:start|help|menu|ce)(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramHome(message);\n    return;\n  }\n  if (message?.chat?.id && /^\\/(?:ping|status)(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramSystemStatus(message);\n    return;\n  }\n  if (message?.chat?.id && /^\\/rate(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramRate(message);\n    return;\n  }\n  if (message?.chat?.id && /^\\/pin(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramPin(message, false);\n    return;\n  }\n  if (message?.chat?.id && /^\\/unpin(?:@\\w+)?(?:\\s|$)/i.test(message.text || "")) {\n    await handleTelegramPin(message, true);\n    return;\n  }\n  if (message?.chat?.id && imageFileId(message)) {\n    await handleLiveSlipMessage(message);\n    return;\n  }\n  if (message?.chat?.type === "private" && /^\\/sandbox(?:\\s|$)/i.test(message.text || "")) {`;
server = replaceOnce(server, messageAnchor, messageRouter, 'LIVE_INTAKE_MESSAGE_ROUTER_ANCHOR_NOT_FOUND');

// Public, read-only diagnostics. No secrets or PII.
const telegramStatusAnchor = 'app.get("/api/v1/telegram/status", async (req, res) => {';
const diagnosticsRoutes = String.raw`app.get("/api/v1/market-rate", async (req, res) => {
  try {
    const market = await fetchBinanceThSpot();
    res.set("Cache-Control", "no-store").json({ data: market });
  } catch (error) {
    problem(res, req, 503, "MARKET_RATE_UNAVAILABLE", "Binance TH USDT/THB spot could not be verified.");
  }
});

app.get("/api/v1/intake/status", async (req, res) => {
  if (!requireRepository(req, res)) return;
  const [deskRate, pins, market] = await Promise.all([
    repository.getLatestDeskRate().catch(() => null),
    repository.listPinnedBanksForDate(bangkokDateKey()).catch(() => []),
    fetchBinanceThSpot().catch(() => null),
  ]);
  res.set("Cache-Control", "no-store").json({
    data: {
      ...intakeCapability(),
      market: market ? { symbol: market.symbol, price: market.price, source: market.source, observed_at: market.observed_at, fresh: market.fresh } : null,
      desk_rate_configured: Number(deskRate?.sell_rate) > 0,
      pinned_accounts_today: pins.length,
      settlement_enabled: false,
    },
  });
});

app.get("/api/v1/telegram/status", async (req, res) => {`;
server = replaceOnce(server, telegramStatusAnchor, diagnosticsRoutes, 'LIVE_INTAKE_DIAGNOSTICS_ANCHOR_NOT_FOUND');

// Feed live Binance market into the operational board endpoint created by patch-ops-board.
server = replaceOnce(
  server,
  'const [transactions, pendingSlips, rates, cycles, bankAccounts, exceptions] = await Promise.all([',
  'const [transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, market] = await Promise.all([',
  'LIVE_INTAKE_OPS_PROMISE_HEADER_NOT_FOUND',
);
server = replaceOnce(
  server,
  '      repository.listOpsOpenExceptions(),\n    ]);',
  '      repository.listOpsOpenExceptions(),\n      fetchBinanceThSpot().catch(() => null),\n    ]);',
  'LIVE_INTAKE_OPS_PROMISE_BODY_NOT_FOUND',
);
server = replaceOnce(
  server,
  'buildOpsOverview({ transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, transactionLimit })',
  'buildOpsOverview({ transactions, pendingSlips, rates, cycles, bankAccounts, exceptions, market, transactionLimit })',
  'LIVE_INTAKE_OPS_BUILD_ANCHOR_NOT_FOUND',
);
writeFileSync(serverPath, server);

const tests = String.raw`import test from "node:test";
import assert from "node:assert/strict";
import { accountLast4, bangkokDateKey, decideIntake, divideDecimal, findPinnedMatch, fingerprintImage, makeLedgerIdentity, normalizeBank, normalizeSlipDate, parseBinanceSpot } from "../server/live-intake.mjs";

test("Binance parser only accepts positive USDTTHB spot", () => {
  const spot = parseBinanceSpot({ symbol: "USDTTHB", price: "32.4567" }, "2026-10-05T22:00:00.000Z");
  assert.equal(spot.price, "32.4567");
  assert.equal(spot.source, "BINANCE_TH_SPOT");
  assert.throws(() => parseBinanceSpot({ symbol: "BTCUSDT", price: "1" }), /BINANCE_SYMBOL_INVALID/);
  assert.throws(() => parseBinanceSpot({ symbol: "USDTTHB", price: "0" }), /BINANCE_PRICE_INVALID/);
});

test("desk conversion uses exact decimal arithmetic", () => {
  assert.equal(divideDecimal("50000", "34.50", 6), "1449.275362");
  assert.equal(divideDecimal("1000000.01", "37.1234", 6), "26937.194045");
});

test("bank matching requires pinned last4 and compatible bank", () => {
  const pins = [{ id: "1", bank_name: "KBANK", account_number: "1234567890" }];
  assert.equal(findPinnedMatch({ bank: "Kasikorn", receiverLast4: "7890" }, pins)?.id, "1");
  assert.equal(findPinnedMatch({ bank: "SCB", receiverLast4: "7890" }, pins), null);
  assert.equal(accountLast4("xxx-7890"), "7890");
  assert.equal(normalizeBank("ธนาคารกสิกรไทย"), "KBANK");
});

test("intake fails closed until every auto-record gate passes", () => {
  const base = {
    slip: { thbAmount: 50000, confidence: 95, date: "06/10/26" },
    pinnedMatch: { id: "bank" },
    pinnedCount: 1,
    deskRate: { sell_rate: "35.2" },
    market: { price: "32.9", fresh: true },
    businessDate: "2026-10-06",
  };
  assert.deepEqual(decideIntake(base), { status: "VERIFIED", promotable: true });
  assert.equal(decideIntake({ ...base, slip: { ...base.slip, confidence: 89 } }).promotable, false);
  assert.equal(decideIntake({ ...base, pinnedMatch: null }).status, "BANK_MISMATCH");
  assert.equal(decideIntake({ ...base, deskRate: null }).status, "RATE_REQUIRED");
  assert.equal(decideIntake({ ...base, market: null }).status, "MARKET_UNAVAILABLE");
  assert.equal(decideIntake({ ...base, slip: { ...base.slip, date: "05/10/26" } }).status, "STALE_SLIP");
});

test("fingerprint and ledger identity are deterministic", () => {
  const fingerprint = fingerprintImage(Buffer.from("same-slip"));
  const first = makeLedgerIdentity(fingerprint, new Date("2026-10-05T22:00:00.000Z"));
  const second = makeLedgerIdentity(fingerprint, new Date("2026-10-05T22:00:00.000Z"));
  assert.deepEqual(first, second);
  assert.equal(first.dateKey, "2026-10-06");
  assert.match(first.ledgerRef, /^CE-20261006-/);
  assert.equal(normalizeSlipDate("6/10/69"), "2026-10-06");
  assert.equal(bangkokDateKey(new Date("2026-10-05T22:00:00.000Z")), "2026-10-06");
});
`;
writeFileSync(path.join(testsPath, 'live-intake.test.mjs'), tests);

console.log('Patched CE VAULT Telegram/OCR intake to operational Supabase tables with Binance TH spot gating.');
