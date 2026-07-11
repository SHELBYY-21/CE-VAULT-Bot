// ============================================================
// ตรวจ API key สำหรับ route ที่เขียนข้อมูล (ให้เฉพาะบอทเรียกได้)
// - ตั้ง API_SECRET ใน ENV แล้วให้ผู้เรียกส่ง header: x-api-key: <secret>
// - ถ้าไม่ตั้ง API_SECRET จะข้ามการตรวจ (สะดวกตอน dev)
// - เทียบแบบ constant-time กัน timing attack
// ============================================================
import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * คืน NextResponse 401 ถ้าไม่ผ่าน, หรือ null ถ้าผ่าน (ให้ทำงานต่อ)
 */
export function requireApiKey(req: NextRequest): NextResponse | null {
  const secret = process.env.API_SECRET;
  if (!secret) return null; // dev mode: ไม่ได้ตั้ง secret = เปิดโล่ง

  const provided = req.headers.get('x-api-key') ?? '';
  if (!safeEqual(provided, secret)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  return null;
}
