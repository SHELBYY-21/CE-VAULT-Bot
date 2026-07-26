/**
 * Admin identity: `/admin` followed by display name only.
 */

export type AdminCommandParse =
  | { matched: false }
  | { matched: true; name: string };

export function parseAdminCommand(text: string): AdminCommandParse {
  const t = (text || '').trim();
  const m = t.match(/^\/admin(?:@[\w_]+)?(?:\s+([\s\S]+))?$/i);
  if (!m) return { matched: false };
  const name = (m[1] ?? '').trim().replace(/\s+/g, ' ').slice(0, 60);
  return { matched: true, name };
}

export function isValidAdminName(name: string): boolean {
  const n = (name || '').trim();
  if (n.length < 1 || n.length > 60) return false;
  if (/^[+-]?[\d.,]+$/.test(n)) return false;
  if (/^[+-]\s*[\d.,]+/.test(n) && !/[^\d.,\s+-]/.test(n)) return false;
  return true;
}
