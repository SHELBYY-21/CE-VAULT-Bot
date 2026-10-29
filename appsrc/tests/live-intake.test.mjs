import test from "node:test";
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
  assert.equal(divideDecimal("1000000.01", "37.1234", 6), "26937.188135");
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
