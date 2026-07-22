'use client';

import { useMemo, useState, type ReactNode } from 'react';
import NovaMascot from './NovaMascot';

export type InteractiveCardState = 'welcome' | 'loading' | 'waiting' | 'success' | 'error';

type Props = {
  /** Controlled state — ถ้าไม่ส่ง จะแสดง tab switcher (showcase) */
  state?: InteractiveCardState;
  usdtAmount?: number | null;
  txid?: string | null;
  network?: string;
  progress?: number;
  showTabs?: boolean;
  className?: string;
};

const TABS: Array<{ id: InteractiveCardState; label: string; icon: string }> = [
  { id: 'success', label: 'Success', icon: '✅' },
  { id: 'loading', label: 'Loading', icon: '⚙️' },
  { id: 'error', label: 'Error', icon: '⚠️' },
  { id: 'welcome', label: 'Welcome', icon: '🌟' },
  { id: 'waiting', label: 'Waiting', icon: '⏳' },
];

function Chip({
  children,
  tone = 'green',
}: {
  children: ReactNode;
  tone?: 'green' | 'cyan' | 'red' | 'gold';
}) {
  const map = {
    green: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
    cyan: 'border-cyan-400/40 bg-cyan-500/10 text-cyan-300',
    red: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
    gold: 'border-amber-400/40 bg-amber-500/10 text-amber-300',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[11px] font-semibold ${map[tone]}`}>
      {children}
    </span>
  );
}

function Sig({ children, tone = 'green' }: { children: ReactNode; tone?: 'green' | 'cyan' | 'red' | 'gold' }) {
  const color =
    tone === 'cyan'
      ? 'bg-cyan-400 shadow-[0_0_6px_#00d8ff]'
      : tone === 'red'
        ? 'bg-rose-400 shadow-[0_0_6px_#ff5a6e]'
        : tone === 'gold'
          ? 'bg-amber-400 shadow-[0_0_6px_#f4c542]'
          : 'bg-emerald-400 shadow-[0_0_6px_#00e676]';
  return (
    <div className="flex items-center justify-center gap-2 border-t border-[color:var(--border)] px-3 py-2.5 text-[10px] tracking-[0.12em] text-[color:var(--muted)]">
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
      {children}
      <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
    </div>
  );
}

function WelcomeCard() {
  return (
    <div className="glass overflow-hidden">
      <div className="brand-grid relative bg-gradient-to-br from-[#00401a] to-[#001c3a] px-5 pb-4 pt-6">
        <div className="relative z-[1] flex items-center justify-center gap-3">
          <div className="relative grid h-[84px] w-[84px] place-items-center rounded-full border-[3px] border-[color:var(--brand-1)] bg-gradient-to-br from-[#001a10] to-[#00401a] shadow-[0_0_24px_rgba(0,230,118,0.5)]">
            <div className="flex flex-col items-center leading-none">
              <span className="text-[22px] font-black tracking-tight">CE</span>
              <span className="text-[7.5px] font-bold tracking-[0.2em] text-[color:var(--brand-1)]">VAULT</span>
            </div>
            <span className="absolute bottom-1 right-1 h-3 w-3 rounded-full border-2 border-[#0b0f14] bg-[color:var(--brand-1)]" />
          </div>
          <NovaMascot expression="happy" size={96} float />
        </div>
        <div className="relative z-[1] mt-3 text-center">
          <div className="text-[12px] uppercase tracking-[0.12em] text-emerald-400/80">欢迎来到 · Welcome to</div>
          <div className="mt-1 text-3xl font-black tracking-wide">
            CE <span className="text-[color:var(--brand-1)]">VAULT</span>
          </div>
          <div className="mt-1 text-sm tracking-wide text-white/55">USDT EXCHANGE BOT</div>
        </div>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div className="text-center">
          <div className="text-[15px] font-bold">รวดเร็ว · ปลอดภัย · ไว้ใจได้</div>
          <div className="mt-1 text-[12px] text-[color:var(--muted)]">安全 · 快速 · 可靠</div>
          <div className="mt-0.5 text-[11px] text-[color:var(--muted)]">FAST · SECURE · TRUSTED</div>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {[
            ['⚡', 'รวดเร็ว', 'Fast · 快速'],
            ['🛡️', 'ปลอดภัย', 'Secure · 安全'],
            ['💎', 'ไว้ใจได้', 'Trusted · 可靠'],
            ['🌐', '24/7 บริการ', 'Support · 全天候'],
          ].map(([icon, th, en]) => (
            <div
              key={th}
              className="flex items-center gap-2.5 rounded-[10px] border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2.5"
            >
              <span className="text-lg">{icon}</span>
              <div>
                <div className="text-[12px] font-bold">{th}</div>
                <div className="text-[10px] text-[color:var(--muted)]">{en}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="text-center">
          <span className="inline-block rounded-full border border-[color:var(--brand-1)] bg-gradient-to-br from-[#00401a] to-[#005a25] px-6 py-2.5 text-[13px] font-bold tracking-wide text-[color:var(--brand-1)] shadow-[0_0_20px_rgba(0,230,118,0.2)]">
            📸 ส่งสลิป เริ่มแลก USDT
          </span>
        </div>
      </div>
      <Sig>CE VAULT BOT · @CEboi88bot · 24/7 SUPPORT</Sig>
    </div>
  );
}

function LoadingCard({ progress = 87 }: { progress?: number }) {
  const pct = Math.max(0, Math.min(100, Math.round(progress)));
  return (
    <div className="glass overflow-hidden">
      <div className="brand-grid relative h-[172px] overflow-hidden bg-gradient-to-b from-[#001020] to-[#000e1a]">
        <div className="nova-scan-line" aria-hidden />
        <div className="absolute inset-0 flex items-center justify-center gap-4">
          <svg width="106" height="126" viewBox="0 0 120 140" className="opacity-85" aria-hidden>
            <rect x="15" y="10" width="90" height="120" rx="6" fill="#0f1c2e" stroke="rgba(0,242,255,.3)" strokeWidth="1.5" />
            <polygon points="85,10 105,10 105,30 85,30" fill="#071828" stroke="rgba(0,242,255,.2)" strokeWidth="1" />
            <rect x="25" y="30" width="50" height="5" rx="2" fill="rgba(0,242,255,.2)" />
            <rect x="25" y="43" width="70" height="4" rx="2" fill="rgba(255,255,255,.1)" />
            <rect x="25" y="55" width="65" height="4" rx="2" fill="rgba(255,255,255,.1)" />
            <rect x="25" y="67" width="55" height="4" rx="2" fill="rgba(255,255,255,.1)" />
            <rect x="25" y="82" width="70" height="14" rx="3" fill="rgba(0,230,118,.12)" stroke="rgba(0,230,118,.4)" strokeWidth="1" />
            <circle cx="80" cy="112" r="12" fill="none" stroke="rgba(0,230,118,.5)" strokeWidth="1.5" strokeDasharray="3,2" />
            <text x="80" y="116" textAnchor="middle" fontSize="9" fontWeight="900" fill="rgba(0,230,118,.7)">
              CE
            </text>
          </svg>
          <NovaMascot expression="focused" size={88} />
        </div>
      </div>
      <div className="space-y-3 px-5 py-5">
        <div className="text-center">
          <Chip tone="cyan">⚙️ กำลังดำเนินการ</Chip>
          <div className="mt-3 text-lg font-bold">正在处理您的订单</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">กำลังดำเนินการแลกเปลี่ยน USDT</div>
        </div>
        <div className="flex items-center justify-between text-xs">
          <span className="text-[color:var(--muted)]">กำลังตรวจสอบสลิป (OCR)</span>
          <span className="font-bold text-[color:var(--brand-1)]">{pct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded bg-white/10">
          <div
            className="nova-progress h-full rounded bg-gradient-to-r from-emerald-500 via-emerald-400 to-cyan-400"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="space-y-2.5 text-[13px]">
          {[
            { done: true, label: 'รับสลิป', sub: 'Received' },
            { done: true, label: 'OCR วิเคราะห์สลิป', sub: 'Done' },
            { done: false, active: true, label: 'กำลังบันทึกธุรกรรม', sub: 'Processing...' },
            { done: false, label: 'ส่ง USDT', sub: 'Transfer', dim: true },
          ].map((s, i) => (
            <div key={s.label} className={`flex items-center gap-3 ${s.dim ? 'opacity-35' : ''}`}>
              <span
                className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] ${
                  s.done
                    ? 'border border-emerald-400 bg-emerald-500/15 text-emerald-300'
                    : s.active
                      ? 'border-2 border-cyan-400'
                      : 'border border-[color:var(--border)]'
                }`}
              >
                {s.done ? '✓' : s.active ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-cyan-400" /> : i + 1}
              </span>
              <span className={s.active ? 'text-cyan-300' : ''}>
                {s.label} <span className="text-[color:var(--muted)]">({s.sub})</span>
              </span>
            </div>
          ))}
        </div>
      </div>
      <Sig tone="cyan">กำลังดำเนินการ · PLEASE WAIT · 处理中</Sig>
    </div>
  );
}

function WaitingCard() {
  return (
    <div className="glass overflow-hidden">
      <div className="brand-grid space-y-4 px-5 py-6 text-center">
        <div className="flex items-center justify-center gap-3">
          <svg width="112" height="112" viewBox="0 0 120 120" aria-hidden>
            <circle cx="60" cy="60" r="56" fill="none" stroke="rgba(0,242,255,.15)" strokeWidth="4" />
            <circle
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke="rgba(0,242,255,.4)"
              strokeWidth="2"
              strokeDasharray="8,4"
              strokeLinecap="round"
              className="nova-clock-ring"
            />
            <circle cx="60" cy="60" r="44" fill="rgba(0,15,30,.8)" stroke="#00d8ff" strokeWidth="1.5" />
            <g stroke="rgba(0,242,255,.3)" strokeWidth="1.5" strokeLinecap="round">
              <line x1="60" y1="20" x2="60" y2="28" />
              <line x1="100" y1="60" x2="92" y2="60" />
              <line x1="60" y1="100" x2="60" y2="92" />
              <line x1="20" y1="60" x2="28" y2="60" />
            </g>
            <g className="nova-hand-min origin-center" style={{ transformOrigin: '60px 60px' }}>
              <line x1="60" y1="60" x2="60" y2="26" stroke="#00d8ff" strokeWidth="2" strokeLinecap="round" />
            </g>
            <g className="nova-hand-sec origin-center" style={{ transformOrigin: '60px 60px' }}>
              <line x1="60" y1="60" x2="60" y2="22" stroke="#00e676" strokeWidth="1.5" strokeLinecap="round" />
            </g>
            <circle cx="60" cy="60" r="3" fill="#00d8ff" />
          </svg>
          <NovaMascot expression="focused" size={96} />
        </div>
        <Chip tone="gold">⏳ รอสักครู่นะคะ</Chip>
        <div>
          <div className="text-xl font-bold">订单处理中...</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">กำลังดำเนินการ · Processing your order</div>
        </div>
        <div className="rounded-xl border border-[color:var(--border)] bg-black/30 px-4 py-4">
          <div className="text-[10px] uppercase tracking-[0.1em] text-[color:var(--muted)]">
            预计时间 / Estimated Time / ประมาณเวลา
          </div>
          <div className="mt-1 text-4xl font-black tracking-tight text-cyan-300">
            10<span className="text-lg font-normal text-[color:var(--muted)]">~</span>15
          </div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">นาที / 分钟 / min</div>
        </div>
        <p className="text-[12px] text-[color:var(--muted)]">
          กรุณารอสักครู่ ทีมงานกำลังดำเนินการ
          <br />
          <span className="text-[11px]">请稍等，我们正在处理您的订单</span>
        </p>
      </div>
      <Sig tone="gold">CE VAULT · TRUSTED · SAFE · 24/7</Sig>
    </div>
  );
}

function SuccessCard({
  usdtAmount,
  txid,
  network = 'TRC-20',
}: {
  usdtAmount?: number | null;
  txid?: string | null;
  network?: string;
}) {
  const time = useMemo(
    () =>
      new Date().toLocaleTimeString('th-TH', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }),
    [],
  );
  // แสดงยอดจริงเท่านั้น — ไม่ fallback ค่าม็อก (เคยเป็น 286)
  const amount =
    typeof usdtAmount === 'number' && Number.isFinite(usdtAmount) ? Math.max(0, usdtAmount) : 0;
  const amountLabel = amount.toLocaleString('th-TH', {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 6,
  });
  return (
    <div className="glass relative overflow-hidden">
      <div className="brand-grid space-y-3 px-5 py-6 text-center">
        <div className="flex items-end justify-center gap-2">
          <svg width="104" height="104" viewBox="0 0 110 110" aria-hidden>
            <circle cx="55" cy="55" r="50" fill="none" stroke="rgba(0,230,118,.15)" strokeWidth="8" />
            <circle
              className="nova-circle-in"
              cx="55"
              cy="55"
              r="46"
              fill="none"
              stroke="#00e676"
              strokeWidth="3"
              strokeLinecap="round"
            />
            <polyline
              className="nova-check-in"
              points="32,55 47,72 78,38"
              fill="none"
              stroke="#00e676"
              strokeWidth="5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <circle cx="55" cy="55" r="36" fill="rgba(0,230,118,.06)" />
          </svg>
          <NovaMascot expression="wink" size={72} />
        </div>
        <Chip>✔ Transaction Complete</Chip>
        <div>
          <div className="text-xl font-bold">ทำรายการสำเร็จ</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">交易完成 · USDT Sent</div>
        </div>
        <div>
          <div className="text-[12px] tracking-wide text-[color:var(--muted)]">AMOUNT / จำนวน</div>
          <div className="mt-1">
            <span className="text-5xl font-black tracking-tight text-[color:var(--brand-1)]">
              {amountLabel}
            </span>{' '}
            <span className="text-xl font-bold text-cyan-300">USDT</span>
          </div>
        </div>
        <div className="space-y-2 text-left text-sm">
          <div className="flex justify-between gap-3 border-t border-[color:var(--border)] pt-2">
            <span className="text-[color:var(--muted)]">TXID</span>
            <span className="font-mono text-xs text-[color:var(--text)]">{txid || '—'}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-[color:var(--muted)]">Network</span>
            <span>{network}</span>
          </div>
          <div className="flex justify-between gap-3 border-b border-[color:var(--border)] pb-2">
            <span className="text-[color:var(--muted)]">Time</span>
            <span>{time}</span>
          </div>
        </div>
        <div className="text-sm text-[color:var(--muted)]">
          ขอบคุณที่ไว้วางใจ CE VAULT 💚
          <div className="mt-1 text-[12px]">感谢您的信任与支持</div>
        </div>
      </div>
      <Sig>CE VAULT · FAST · SECURE · TRUSTED · 24/7</Sig>
    </div>
  );
}

function ErrorCard() {
  return (
    <div className="glass overflow-hidden border-rose-400/25">
      <div className="brand-grid-error space-y-4 px-5 py-6 text-center">
        <div className="flex items-end justify-center gap-2.5">
          <svg className="nova-shake" width="86" height="80" viewBox="0 0 100 92" aria-hidden>
            <path
              d="M50 6 L96 84 L4 84 Z"
              fill="rgba(255,90,110,.08)"
              stroke="#ff5a6e"
              strokeWidth="3"
              strokeLinejoin="round"
            />
            <line x1="50" y1="34" x2="50" y2="58" stroke="#ff5a6e" strokeWidth="5" strokeLinecap="round" />
            <circle cx="50" cy="70" r="3.5" fill="#ff5a6e" />
          </svg>
          <NovaMascot expression="sad" size={72} />
        </div>
        <Chip tone="red">⚠ System Error</Chip>
        <div>
          <div className="text-xl font-bold text-rose-300">Something went wrong.</div>
          <div className="mt-1 text-sm text-[color:var(--muted)]">系统错误 · เกิดข้อผิดพลาด</div>
        </div>
        <p className="text-[13px] leading-relaxed text-[color:var(--muted)]">
          กรุณาลองใหม่อีกครั้ง หรือติดต่อทีมซัพพอร์ต
          <br />
          <span className="text-[11px]">请再试一次或联系客服 · Please try again or contact support</span>
        </p>
        <div className="flex justify-center gap-2.5">
          <span className="rounded-[10px] bg-rose-500 px-5 py-2.5 text-xs font-extrabold tracking-wide text-[#1a0508]">
            Contact Support
          </span>
          <span className="rounded-[10px] border border-[color:var(--border)] px-5 py-2.5 text-xs text-[color:var(--text)]">
            🔄 Retry
          </span>
        </div>
      </div>
      <Sig tone="red">CE VAULT · 24/7 SUPPORT · 客服在线</Sig>
    </div>
  );
}

export function InteractiveStatusCard({
  state = 'welcome',
  usdtAmount,
  txid,
  network = 'TRC-20',
  progress = 87,
}: Props) {
  switch (state) {
    case 'loading':
      return <LoadingCard progress={progress} />;
    case 'waiting':
      return <WaitingCard />;
    case 'success':
      return <SuccessCard usdtAmount={usdtAmount} txid={txid} network={network} />;
    case 'error':
      return <ErrorCard />;
    case 'welcome':
    default:
      return <WelcomeCard />;
  }
}

/** Showcase with tab switcher (brand page) */
export default function InteractiveCards() {
  const [state, setState] = useState<InteractiveCardState>('welcome');
  const [amount, setAmount] = useState('286');
  const [txid, setTxid] = useState('0x8d71...a3f8c9');

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setState(t.id)}
            className={`rounded-[10px] border px-3.5 py-2 text-[11px] font-bold uppercase tracking-wide transition ${
              state === t.id
                ? 'border-emerald-400/45 bg-emerald-500/[0.07] text-[color:var(--brand-1)]'
                : 'border-[color:var(--border)] text-[color:var(--muted)] hover:text-[color:var(--text)]'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>
      <div className="mx-auto max-w-[440px]">
        <InteractiveStatusCard
          state={state}
          usdtAmount={Number(amount) || 0}
          txid={txid}
        />
        {state === 'success' && (
          <div className="mt-4 flex flex-wrap gap-2.5">
            <label className="min-w-[110px] flex-1 text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
              USDT Amount
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white/5 px-3 py-2 text-sm text-[color:var(--text)]"
              />
            </label>
            <label className="min-w-[150px] flex-[2] text-[10px] uppercase tracking-wide text-[color:var(--muted)]">
              TXID
              <input
                type="text"
                value={txid}
                onChange={(e) => setTxid(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[color:var(--border)] bg-white/5 px-3 py-2 font-mono text-xs text-[color:var(--text)]"
              />
            </label>
          </div>
        )}
        <p className="mt-3 text-center text-[11px] text-[color:var(--muted)]">
          Live preview — สลับแท็บเพื่อดูทุก state · แก้ค่าสำเร็จเพื่อดูการ์ดเปลี่ยนสด
        </p>
      </div>
    </div>
  );
}
