import NovaMascot, { type NovaExpression } from './NovaMascot';

const SPECS: Array<[string, string]> = [
  ['Age', '20–24 (appearance)'],
  ['Hair', 'Cyan Long Ponytail'],
  ['Eyes', 'Emerald Green'],
  ['Outfit', 'Cyber Hoodie (Black) · Carbon Fiber'],
  ['Accent', 'Neon Green / Cyan · CE Logo on Left Sleeve'],
  ['Personality', 'Friendly · Professional · Trustworthy'],
];

const EXPRESSIONS: Array<{ key: NovaExpression; label: string; icon: string }> = [
  { key: 'happy', label: 'Welcome', icon: '😊' },
  { key: 'focused', label: 'Waiting', icon: '🕒' },
  { key: 'wink', label: 'Success', icon: '✅' },
  { key: 'sad', label: 'Sorry', icon: '⚠️' },
  { key: 'thanks', label: 'Thanks', icon: '🙏' },
  { key: 'closed', label: 'Happy', icon: '💚' },
];

/** 05 · Mascot — NOVA character sheet */
export default function MascotSheet() {
  return (
    <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
      <div className="glass overflow-hidden">
        <div className="flex items-center justify-between border-b border-[color:var(--border)] px-4 py-3 text-[11px] tracking-wide text-[color:var(--muted)]">
          <span>
            CHARACTER · <b className="text-[color:var(--text)]">NOVA</b>
          </span>
          <span className="text-[color:var(--gold)]">★★★★★</span>
        </div>
        <div className="brand-grid relative flex min-h-[280px] flex-col items-center justify-center gap-2 px-6 py-8">
          <NovaMascot expression="happy" size={140} float />
          <div className="mt-2 text-3xl font-black tracking-[0.12em] text-[color:var(--brand-1)]">NOVA</div>
          <div className="text-xs tracking-wide text-[color:var(--muted)]">
            Virtual Idol · Fintech Assistant
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <div className="border-b border-[color:var(--border)] px-4 py-3 text-[11px] tracking-wide text-[color:var(--muted)]">
          <b className="text-[color:var(--text)]">DETAILS</b> &amp; EXPRESSIONS
        </div>
        <div className="space-y-2 px-4 py-4">
          {SPECS.map(([k, v]) => (
            <div
              key={k}
              className="flex items-start justify-between gap-3 border-b border-[color:var(--border)] py-2 text-sm last:border-0"
            >
              <span className="shrink-0 text-[11px] uppercase tracking-wider text-[color:var(--muted)]">
                {k}
              </span>
              <span className="text-right text-[13px] text-[color:var(--text)]">{v}</span>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-3 gap-3 border-t border-[color:var(--border)] px-4 py-4 sm:grid-cols-6">
          {EXPRESSIONS.map((e) => (
            <div key={e.key} className="flex flex-col items-center gap-1.5">
              <div className="grid h-14 w-14 place-items-center rounded-full border border-[color:var(--border)] bg-[radial-gradient(circle_at_35%_30%,#17293a,#0b131c)]">
                <NovaMascot expression={e.key} size={40} />
              </div>
              <span className="text-[9px] tracking-wide text-[color:var(--muted)]">
                {e.icon} {e.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
