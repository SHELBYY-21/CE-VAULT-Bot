/**
 * ตั้งชื่อแอดมินต้องใช้คำสั่ง /admin ตามด้วยชื่อเท่านั้น
 * เช่น `/admin แอดมิน A` หรือ `/admin@CEboi88bot RAZEN`
 */

export type AdminCommandParse =
  | { matched: false }
  | { matched: true; name: string };

/** ดึงชื่อจากคำสั่ง /admin (รองรับ @botusername) */
export function parseAdminCommand(text: string): AdminCommandParse {
  const t = (text || '').trim();
  const m = t.match(/^\/admin(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i);
  if (!m) return { matched: false };
  const name = (m[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return { matched: true, name };
}

/**
 * ชื่อที่ใช้ได้: ไม่ว่าง, ไม่ใช่ตัวเลข/ยอดเงินล้วน
 * (กันพิมพ์ 150 หรือ +500 แล้วกลายเป็นชื่อแอดมิน)
 */
export function isValidAdminName(name: string): boolean {
  const n = (name || '').trim();
  if (n.length < 1 || n.length > 60) return false;
  if (/^[+-]?[\d.,]+$/.test(n)) return false;
  if (/^[+-]\s*[\d.,]+/.test(n) && !/[^\d.,\s+-]/.test(n)) return false;
  return true;
}
