import NovaMascot from './NovaMascot';

/** 03 · Telegram Avatar preview — NOVA in glowing green ring */
export default function TelegramAvatar({ size = 200 }: { size?: number }) {
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="relative grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          background:
            'radial-gradient(circle at 50% 38%, #132029 0%, #0a0f14 100%)',
          boxShadow:
            '0 0 0 4px rgba(0,230,118,0.35), 0 0 28px rgba(0,230,118,0.45), 0 0 0 1px rgba(0,216,255,0.35) inset',
        }}
      >
        <div
          className="absolute inset-[6%] rounded-full border border-cyan-400/40"
          aria-hidden
        />
        <NovaMascot expression="happy" size={Math.round(size * 0.62)} float />
        <span
          className="absolute bottom-[14%] right-[14%] h-4 w-4 rounded-full border-2 border-[#0a0f14] bg-[color:var(--brand-1)] shadow-[0_0_10px_rgba(0,230,118,0.8)]"
          title="online"
        />
      </div>
      <p className="text-center text-[11px] text-[color:var(--muted)]">
        NOVA close-up · วงแหวนเขียวเรือง · online dot
      </p>
    </div>
  );
}
