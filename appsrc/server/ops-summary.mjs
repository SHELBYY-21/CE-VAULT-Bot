const ZERO = Object.freeze({ coefficient: 0n, scale: 0 });

function decimal(value) {
  const raw = String(value ?? '0').trim();
  const match = /^([+-]?)(\d+)(?:\.(\d+))?$/.exec(raw);
  if (!match) throw new Error('INVALID_DECIMAL');
  const sign = match[1] === '-' ? -1n : 1n;
  const fraction = match[3] || '';
  const digits = (match[2] + fraction).replace(/^0+(?=\d)/, '') || '0';
  return { coefficient: BigInt(digits) * sign, scale: fraction.length };
}

function pow10(n) {
  return 10n ** BigInt(n);
}

function align(left, right) {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale),
    scale,
  ];
}

export function addDecimal(leftValue, rightValue) {
  const [left, right, scale] = align(decimal(leftValue), decimal(rightValue));
  return renderDecimal({ coefficient: left + right, scale });
}

export function subtractDecimal(leftValue, rightValue) {
  const [left, right, scale] = align(decimal(leftValue), decimal(rightValue));
  return renderDecimal({ coefficient: left - right, scale });
}

export function isPositiveDecimal(value) {
  return decimal(value).coefficient > 0n;
}

export function sumDecimals(values) {
  return values.reduce((total, value) => addDecimal(total, value ?? '0'), '0');
}

export function renderDecimal(parts) {
  let coefficient = parts.coefficient;
  const negative = coefficient < 0n;
  if (negative) coefficient = -coefficient;
  let digits = coefficient.toString();
  if (parts.scale === 0) return (negative ? '-' : '') + digits;
  if (digits.length <= parts.scale) digits = digits.padStart(parts.scale + 1, '0');
  const integer = digits.slice(0, -parts.scale) || '0';
  const fraction = digits.slice(-parts.scale).replace(/0+$/, '');
  return (negative ? '-' : '') + integer + (fraction ? '.' + fraction : '');
}

function bangkokDateKey(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(isoTimestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return byType.year + '-' + byType.month + '-' + byType.day;
}

function bangkokHourKey(isoTimestamp) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hour12: false,
  }).formatToParts(new Date(isoTimestamp));
  const byType = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const hour = byType.hour === '24' ? '00' : byType.hour;
  return { date: byType.year + '-' + byType.month + '-' + byType.day, hour };
}

function safeExceptionRow(row, now) {
  const createdMs = row.created_at ? new Date(row.created_at).getTime() : NaN;
  const ageMinutes = Number.isFinite(createdMs)
    ? Math.max(0, Math.round((new Date(now).getTime() - createdMs) / 60000))
    : null;
  return {
    exception_type: row.exception_type || 'UNKNOWN',
    status: row.status,
    age_minutes: ageMinutes,
    created_at: row.created_at,
  };
}

function buildHourlyCashflow(rows, now, bucketCount = 12) {
  const reference = new Date(now);
  const buckets = [];
  for (let offset = bucketCount - 1; offset >= 0; offset -= 1) {
    const slot = new Date(reference.getTime() - offset * 3600000);
    const key = bangkokHourKey(slot.toISOString());
    buckets.push({
      key: key.date + ' ' + key.hour,
      hour: key.hour,
      thb_in: '0',
      usdt_sent: '0',
    });
  }
  const index = new Map(buckets.map((bucket, position) => [bucket.key, position]));
  for (const row of rows) {
    if (!row.created_at) continue;
    const key = bangkokHourKey(row.created_at);
    const position = index.get(key.date + ' ' + key.hour);
    if (position == null) continue;
    const bucket = buckets[position];
    if (row.type === 'THB_DEPOSIT') bucket.thb_in = addDecimal(bucket.thb_in, row.thb_amount ?? '0');
    bucket.usdt_sent = addDecimal(bucket.usdt_sent, row.sent_usdt ?? '0');
  }
  return buckets.map((bucket) => ({
    hour_label: bucket.hour + ':00',
    thb_in: bucket.thb_in,
    usdt_sent: bucket.usdt_sent,
  }));
}

function maskedReference(value) {
  if (!value) return null;
  const text = String(value);
  if (text.length <= 4) return '••••';
  return '••••' + text.slice(-4);
}

function safeRecentTransaction(row) {
  return {
    reference: maskedReference(row.ledger_ref),
    type: row.type,
    status: row.status,
    thb_amount: String(row.thb_amount ?? '0'),
    expected_usdt: String(row.expected_usdt ?? '0'),
    sent_usdt: String(row.sent_usdt ?? '0'),
    delta_usdt: String(row.delta_usdt ?? '0'),
    room_name: row.room_name || null,
    bank_match_result: row.bank_match_result || null,
    is_stale_slip: row.is_stale_slip === true,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function safePendingSlip(row) {
  return {
    reference: maskedReference(row.ledger_ref || row.short_ref),
    status: row.status,
    thb_in: row.thb_in == null ? null : String(row.thb_in),
    should_send: row.should_send == null ? null : String(row.should_send),
    desk_rate: row.desk_rate == null ? null : String(row.desk_rate),
    market_rate: row.mkt_rate == null ? null : String(row.mkt_rate),
    bank: row.bank || null,
    account_masked: row.account_masked || null,
    pin_match: row.pin_match === true,
    ocr_confidence: row.ocr_confidence == null ? null : String(row.ocr_confidence),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export function buildOpsOverview({
  transactions = [],
  pendingSlips = [],
  rates = [],
  cycles = [],
  bankAccounts = [],
  exceptions = [],
  market = null,
  now = new Date().toISOString(),
  transactionLimit = 1000,
} = {}) {
  const businessDate = bangkokDateKey(now);
  const today = transactions.filter((row) => row?.created_at && bangkokDateKey(row.created_at) === businessDate && row.is_reversed !== true);
  const thbIn = sumDecimals(today.filter((row) => row.type === 'THB_DEPOSIT').map((row) => row.thb_amount ?? '0'));
  const sentUsdt = sumDecimals(today.map((row) => row.sent_usdt ?? '0'));
  const pendingUsdt = sumDecimals(today.map((row) => {
    const delta = subtractDecimal(row.expected_usdt ?? '0', row.sent_usdt ?? '0');
    return isPositiveDecimal(delta) ? delta : '0';
  }));
  const bankBalance = sumDecimals(bankAccounts.map((row) => row.current_balance ?? '0'));
  const staleSlips = today.filter((row) => row.is_stale_slip === true).length;
  const latestRate = rates[0] || null;
  const activeCycle = cycles[0] || null;

  return {
    generated_at: now,
    business_date: businessDate,
    mode: 'READ_ONLY',
    kpis: {
      thb_in: thbIn,
      sent_usdt: sentUsdt,
      pending_usdt: pendingUsdt,
      transactions: today.length,
      pending_slips: pendingSlips.length,
      open_exceptions: exceptions.length,
      stale_slips: staleSlips,
      bank_balance_thb: bankBalance,
    },
    rate: (latestRate || market) ? {
      sell_rate: String(latestRate?.sell_rate ?? '0'),
      market_usdt_rate: market?.price ? String(market.price) : String(latestRate?.market_usdt_rate ?? '0'),
      market_source: market?.fresh ? 'BINANCE_TH_SPOT' : 'STALE_DB_SNAPSHOT',
      market_observed_at: market?.observed_at ?? null,
      created_at: latestRate?.created_at ?? null,
    } : null,
    cycle: activeCycle ? {
      cycle_number: activeCycle.cycle_number,
      status: activeCycle.status,
      limit_thb: String(activeCycle.limit_thb ?? '0'),
      created_at: activeCycle.created_at,
    } : null,
    banks: bankAccounts.map((row) => ({
      label: row.label || null,
      bank_name: row.bank_name || null,
      account_number: row.account_number || null,
      current_balance: String(row.current_balance ?? '0'),
    })),
    recent_transactions: transactions.slice(0, 25).map(safeRecentTransaction),
    pending_slips: pendingSlips.slice(0, 25).map(safePendingSlip),
    exceptions_detail: exceptions.slice(0, 25).map((row) => safeExceptionRow(row, now)),
    hourly_cashflow: buildHourlyCashflow(today, now),
    coverage: {
      transactions_scanned: transactions.length,
      transactions_capped: transactions.length >= transactionLimit,
      note: transactions.length >= transactionLimit ? 'Current-day totals may be incomplete because the read cap was reached.' : null,
    },
  };
}
