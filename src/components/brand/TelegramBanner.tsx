import NovaMascot from './NovaMascot';

const CHIPS = [
  { a: '10–15', b: 'MINS' },
  { a: '24/7', b: 'SUPPORT' },
  { a: 'SAFE', b: '& SECURE' },
  { a: 'BEST', b: 'RATE' },
];

/** 04 · Telegram Banner preview */
export default function TelegramBanner() {
  return (
    <div className="overflow-hidden rounded-2xl border border-[color:var(--border)] bg-gradient-to-br from-[#0c1420] to-[#0a1016]">
      <div className="grid gap-4 p-5 sm:grid-cols-[1.2fr_auto] sm:items-center sm:p-6">
        <div>
          <h3 className="text-2xl font-black tracking-tight sm:text-3xl">
            CE <span className="text-[color:var(--brand-1)]">VAULT</span>
          </h3>
          <p className="mt-1 text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
            USDT Exchange Assistant
          </p>
          <p className="mt-2 text-[10px] tracking-[0.16em] text-[color:var(--muted)]">
            SECURE · FAST · TRUSTED
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {CHIPS.map((c) => (
              <div
                key={c.a}
                className="rounded-lg border border-emerald-400/35 px-2 py-2 text-center"
              >
                <div className="text-[11px] font-extrabold text-[color:var(--brand-1)]">{c.a}</div>
                <div className="text-[9px] tracking-wide text-[color:var(--text)]">{c.b}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex justify-center sm:justify-end">
          <NovaMascot expression="wink" size={120} float />
        </div>
      </div>
    </div>
  );
}
