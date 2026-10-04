'use client';

import { FormEvent, useState } from 'react';

type SessionResult = { sessionId: string; mcpUrl: string };

export default function ComposioSessionCard() {
  const [userId, setUserId] = useState('dashboard:ce-vault');
  const [toolkits, setToolkits] = useState('');
  const [accessKey, setAccessKey] = useState('');
  const [session, setSession] = useState<SessionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSession(null);
    setLoading(true);
    try {
      const response = await fetch('/api/composio/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': accessKey },
        body: JSON.stringify({ userId, toolkits }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || 'สร้าง session ไม่สำเร็จ');
      setSession({ sessionId: result.sessionId, mcpUrl: result.mcpUrl });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'สร้าง session ไม่สำเร็จ');
    } finally {
      setAccessKey('');
      setLoading(false);
    }
  }

  return (
    <section className="glass reveal mt-6 overflow-hidden border border-cyan-400/20 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-cyan-300">
            AI CONNECT
          </p>
          <h2 className="mt-1 text-base font-semibold text-white">Composio MCP Session</h2>
          <p className="mt-1 text-xs text-[color:var(--muted)]">
            สร้าง MCP ผ่าน n8n · ใช้ Access key ครั้งเดียว · เก็บ MCP URL เป็นความลับ
          </p>
        </div>
        <span className="rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[10px] font-semibold text-emerald-300">
          SERVER-SIDE
        </span>
      </div>

      <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="grid gap-1 text-xs text-[color:var(--muted)]">
          User ID
          <input
            required
            maxLength={128}
            pattern="[A-Za-z0-9_.:@-]+"
            value={userId}
            onChange={(event) => setUserId(event.target.value)}
            className="rounded-xl border border-[color:var(--border)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-[color:var(--muted)]">
          Toolkits (คั่นด้วย comma)
          <input
            value={toolkits}
            onChange={(event) => setToolkits(event.target.value)}
            placeholder="github,gmail,slack"
            className="rounded-xl border border-[color:var(--border)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          />
        </label>
        <label className="grid gap-1 text-xs text-[color:var(--muted)]">
          CE VAULT Access key
          <input
            required
            type="password"
            autoComplete="off"
            value={accessKey}
            onChange={(event) => setAccessKey(event.target.value)}
            className="rounded-xl border border-[color:var(--border)] bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50"
          />
        </label>
        <div className="flex flex-wrap items-center gap-3 md:col-span-3">
          <button
            type="submit"
            disabled={loading}
            className="rounded-xl bg-cyan-400 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60"
          >
            {loading ? 'กำลังสร้าง…' : 'สร้าง MCP Session'}
          </button>
          {error && <p className="text-xs text-rose-300">{error}</p>}
        </div>
      </form>

      {session && (
        <div className="mt-4 rounded-xl border border-emerald-400/25 bg-emerald-500/10 p-3 text-xs">
          <p className="font-semibold text-emerald-300">Session พร้อมใช้งาน</p>
          <p className="mt-1 break-all text-[color:var(--muted)]">ID: {session.sessionId}</p>
          <a
            href={session.mcpUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-flex text-cyan-300 underline underline-offset-2"
          >
            เปิด MCP URL →
          </a>
        </div>
      )}
    </section>
  );
}
