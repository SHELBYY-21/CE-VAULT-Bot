'use client';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const [passphrase, setPassphrase] = useState('');
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [missing, setMissing] = useState<string[]>([]);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    fetch('/api/dashboard/session', { cache: 'no-store' })
      .then((r) => r.json()).then((data) => {
        setConfigured(Boolean(data.configured));
        if (Array.isArray(data.missing)) setMissing(data.missing.filter((x: unknown) => typeof x === 'string'));
        if (data.authenticated) window.location.replace('/dashboard');
      }).catch(() => setConfigured(false));
  }, []);
  async function login(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true); setMessage('');
    try {
      const result = await fetch('/api/dashboard/session', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin', body: JSON.stringify({ passphrase }),
      });
      if (!result.ok) {
        setMessage(result.status === 429 ? 'ลองใหม่ภายหลัง (คำขอมากเกินกำหนด)' : 'ยืนยันตัวตนไม่สำเร็จ');
        return;
      }
      setPassphrase('');
      window.location.replace('/dashboard');
    } catch {
      setMessage('ไม่สามารถติดต่อระบบยืนยันตัวตนได้');
    } finally {
      setWorking(false);
    }
  }
  return <main className="min-h-screen grid place-items-center bg-[#03070F] px-4 text-[#E4F4FC]">
    <section className="w-full max-w-md rounded-2xl border border-[rgba(0,212,255,.22)] bg-[#080E18] p-7 shadow-2xl">
      <p className="text-[10px] font-bold tracking-[.3em] text-[#F0B429]">CE EMPIRE · PRIVATE WORKSPACE</p>
      <h1 className="mt-3 text-3xl font-semibold">CE VAULT</h1>
      <p className="mt-2 text-sm text-[#91AAB8]">ข้อมูลธุรกรรมต้องเข้าสู่ระบบก่อนใช้งาน</p>
      {configured === false ? <p role="alert" className="mt-5 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-200">
        Dashboard ยังไม่เปิดรับ Session — ตั้งค่า Server-only Environment Variables บน Hosting แล้ว Deploy ใหม่:
        {missing.length > 0 && <span className="mt-2 block font-mono text-xs">{missing.join(' · ')}</span>}
      </p> : <form onSubmit={login} className="mt-6 space-y-4">
        <label htmlFor="vault-access" className="block text-xs font-semibold uppercase tracking-wider text-[#91AAB8]">Access Passphrase</label>
        <input id="vault-access" autoComplete="current-password" type="password"
          minLength={12} maxLength={512} required value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)} disabled={working || configured === null}
          className="w-full rounded-lg border border-[rgba(0,212,255,.25)] bg-[#0C1520] px-4 py-3 text-white outline-none focus:border-[#00D4FF]"/>
        {message && <p role="alert" className="text-sm text-[#FF7777]">{message}</p>}
        <button type="submit" disabled={working || configured !== true}
          className="w-full rounded-lg bg-[#00D4FF] px-5 py-3 text-sm font-bold text-[#03070F] disabled:opacity-50">
          {working ? 'กำลังตรวจสอบ...' : 'เข้าสู่ Empire Desk'}
        </button>
      </form>}
      <p className="mt-6 text-[11px] text-[#7891A1]">การเข้าสู่ระบบนี้ใช้คุกกี้ HttpOnly อายุ 4 ชั่วโมง · ไม่มีการส่งรหัสไปยังเว็บไซต์ภายนอก</p>
    </section>
  </main>;
}
