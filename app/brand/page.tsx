'use client';

import Link from 'next/link';
import TelegramAvatar from '@/components/brand/TelegramAvatar';
import TelegramBanner from '@/components/brand/TelegramBanner';
import MascotSheet from '@/components/brand/MascotSheet';
import InteractiveCards from '@/components/brand/InteractiveCards';
import NovaMascot from '@/components/brand/NovaMascot';

export default function BrandPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-10">
      <header className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-3 flex items-center gap-3">
            <NovaMascot expression="wink" size={48} />
            <h1 className="text-3xl font-black tracking-tight">
              CE <span className="gradient-text">VAULT</span> Brand
            </h1>
          </div>
          <p className="text-sm text-[color:var(--muted)]">
            Telegram Avatar &amp; Banner · Mascot NOVA · UI Cards — Interactive
          </p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-full border border-[color:var(--border)] bg-white/5 px-4 py-2 text-xs font-medium hover:bg-white/10"
        >
          ← Dashboard
        </Link>
      </header>

      <section className="mb-12">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-xs font-bold tracking-widest text-[color:var(--brand-1)]">03–04</span>
          <h2 className="text-xl font-bold">Telegram Avatar &amp; Banner</h2>
        </div>
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="glass flex items-center justify-center p-6">
            <TelegramAvatar size={180} />
          </div>
          <TelegramBanner />
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <a
            href="/brand/avatar-512.png"
            download
            className="rounded-xl border border-[color:var(--border)] bg-white/5 px-4 py-3 text-sm hover:border-emerald-400/40"
          >
            ⬇ Download avatar-512.png
          </a>
          <a
            href="/brand/banner-1200x630.png"
            download
            className="rounded-xl border border-[color:var(--border)] bg-white/5 px-4 py-3 text-sm hover:border-emerald-400/40"
          >
            ⬇ Download banner-1200x630.png
          </a>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-xs font-bold tracking-widest text-[color:var(--brand-1)]">05</span>
          <h2 className="text-xl font-bold">Mascot — NOVA</h2>
          <span className="text-[11px] text-[color:var(--muted)]">ORIGINAL VIRTUAL IDOL</span>
        </div>
        <MascotSheet />
      </section>

      <section className="mb-8">
        <div className="mb-4 flex items-baseline gap-3">
          <span className="text-xs font-bold tracking-widest text-[color:var(--brand-1)]">08–10</span>
          <h2 className="text-xl font-bold">UI Cards — Interactive</h2>
          <span className="text-[11px] text-[color:var(--muted)]">
            LOADING · SUCCESS · ERROR · WELCOME · WAITING
          </span>
        </div>
        <InteractiveCards />
      </section>
    </main>
  );
}
