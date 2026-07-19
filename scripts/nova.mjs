// NOVA mascot — SVG generator ported from brandkit-test.html
// ใช้ร่วมกันทั้ง avatar/banner render และ sticker frame render
export function novaSvg(exp, size) {
  size = size || 88;
  let eyes = '', mouth = '', extra = '';
  if (exp === 'happy' || !exp) {
    eyes = `<ellipse cx="30" cy="44" rx="6.5" ry="8" fill="#0FBF7F"/><ellipse cx="58" cy="44" rx="6.5" ry="8" fill="#0FBF7F"/>
      <circle cx="32" cy="41" r="2.4" fill="#fff"/><circle cx="60" cy="41" r="2.4" fill="#fff"/>`;
    mouth = `<path d="M38 57 Q44 62 50 57" stroke="#E86A8A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  } else if (exp === 'closed') {
    eyes = `<path d="M24 44 Q30 39 36 44" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M52 44 Q58 39 64 44" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M38 56 Q44 62 50 56" stroke="#E86A8A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  } else if (exp === 'wink') {
    eyes = `<ellipse cx="30" cy="44" rx="6.5" ry="8" fill="#0FBF7F"/><circle cx="32" cy="41" r="2.4" fill="#fff"/>
      <path d="M52 44 Q58 40 64 44" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M38 57 Q44 62 50 57" stroke="#E86A8A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
  } else if (exp === 'focused') {
    eyes = `<ellipse cx="30" cy="44" rx="6" ry="6.5" fill="#0FBF7F"/><ellipse cx="58" cy="44" rx="6" ry="6.5" fill="#0FBF7F"/>
      <circle cx="31.5" cy="42" r="2" fill="#fff"/><circle cx="59.5" cy="42" r="2" fill="#fff"/>
      <path d="M23 34 L36 36" stroke="#1FA9C9" stroke-width="2" stroke-linecap="round"/>
      <path d="M65 34 L52 36" stroke="#1FA9C9" stroke-width="2" stroke-linecap="round"/>`;
    mouth = `<path d="M40 58 L48 58" stroke="#E86A8A" stroke-width="2.2" stroke-linecap="round"/>`;
  } else if (exp === 'sad') {
    eyes = `<path d="M24 42 Q30 47 36 42" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M52 42 Q58 47 64 42" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M39 60 Q44 56 49 60" stroke="#E86A8A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    extra = `<circle cx="67" cy="52" r="3" fill="#7FDCF2" opacity=".85"/>`;
  } else if (exp === 'thanks') {
    eyes = `<path d="M24 44 Q30 39 36 44" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      <path d="M52 44 Q58 39 64 44" stroke="#0FBF7F" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    mouth = `<path d="M38 56 Q44 63 50 56" stroke="#E86A8A" stroke-width="2.2" fill="none" stroke-linecap="round"/>`;
    extra = `<path d="M70 26 c2-4 8-3 8 1 c0 3-4 6-8 8 c-4-2-8-5-8-8 c0-4 6-5 8-1Z" fill="#FF7B9C" opacity=".95"/>`;
  }
  return `<g>
  <path d="M12 30 Q2 52 10 76 Q14 84 18 78 Q12 56 20 36 Z" fill="#37D6E8"/>
  <path d="M76 30 Q86 52 78 76 Q74 84 70 78 Q76 56 68 36 Z" fill="#37D6E8"/>
  <path d="M14 32 Q6 52 12 72" stroke="#8FF0FA" stroke-width="1.6" fill="none" opacity=".7"/>
  <path d="M74 32 Q82 52 76 72" stroke="#8FF0FA" stroke-width="1.6" fill="none" opacity=".7"/>
  <path d="M22 78 Q24 66 44 66 Q64 66 66 78 L66 92 Q44 98 22 92 Z" fill="#10181F"/>
  <path d="M44 68 L44 90" stroke="#00E676" stroke-width="1.6" opacity=".8"/>
  <rect x="56" y="78" width="8" height="5" rx="1.5" fill="#0B222B" stroke="#00E676" stroke-width=".8"/>
  <text x="60" y="82" font-size="3.4" fill="#00E676" text-anchor="middle" font-family="monospace" font-weight="bold">CE</text>
  <circle cx="44" cy="45" r="26" fill="#FFE8DC"/>
  <path d="M18 45 Q16 18 44 17 Q72 18 70 45 Q66 32 58 30 Q60 36 56 34 Q50 26 44 30 Q38 26 32 34 Q28 36 30 30 Q22 32 18 45Z" fill="#3FD9EA"/>
  <path d="M24 26 Q34 20 44 21" stroke="#9BF2FB" stroke-width="1.6" fill="none" opacity=".8"/>
  <path d="M16 40 Q14 16 44 14 Q74 16 72 40" stroke="#0E1B22" stroke-width="4.5" fill="none" stroke-linecap="round"/>
  <rect x="10" y="38" width="9" height="15" rx="4" fill="#0E1B22" stroke="#00D8FF" stroke-width="1.2"/>
  <rect x="69" y="38" width="9" height="15" rx="4" fill="#0E1B22" stroke="#00D8FF" stroke-width="1.2"/>
  <circle cx="14.5" cy="45.5" r="2" fill="#00E676"/>
  <circle cx="73.5" cy="45.5" r="2" fill="#00E676"/>
  ${eyes}${mouth}
  <circle cx="24" cy="53" r="3.4" fill="#FFB7C0" opacity=".55"/>
  <circle cx="64" cy="53" r="3.4" fill="#FFB7C0" opacity=".55"/>
  ${extra}
</g>`;
}

/** ห่อ SVG มาร์กอัพเป็นเอกสารเต็ม พร้อม viewBox คงที่ (88x96) และ transform เพิ่มเติม (สำหรับ bob/scale ต่อเฟรม) */
export function novaFrame({ size = 512, exp = 'happy', tx = 0, ty = 0, rot = 0, scale = 1, extraSvg = '' } = {}) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 88 96" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(${44 + tx},${48 + ty}) rotate(${rot}) scale(${scale}) translate(-44,-48)">
      ${novaSvg(exp)}
    </g>
    ${extraSvg}
  </svg>`;
}

/**
 * Canvas 400x400 สำหรับ sticker — nova วางกึ่งกลางคงที่ + prop วาดในพิกัด world 0-400 เดียวกัน
 * (novaFrame ด้านบนใช้ viewBox 88x96 สำหรับ avatar/banner ที่ scale เองภายนอก — คนละบริบทกัน)
 */
const STICKER_BASE_SCALE = 3.6;
const STICKER_TX = 42;
const STICKER_TY = 32;

export function novaSticker({ exp = 'happy', ty = 0, rot = 0, propSvg = '' } = {}) {
  return `<svg width="512" height="512" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
    <g transform="translate(${STICKER_TX},${STICKER_TY + ty}) rotate(${rot}) scale(${STICKER_BASE_SCALE})">
      ${novaSvg(exp)}
    </g>
    ${propSvg}
  </svg>`;
}

/** CE circular logo mark */
export function ceMarkSvg(fg, ring) {
  return `<circle cx="52" cy="52" r="44" fill="none" stroke="${ring}" stroke-width="5"/>
  <circle cx="52" cy="52" r="34" fill="none" stroke="${ring}" stroke-width="1.6" stroke-dasharray="4,5"/>
  <path d="M52 8 L52 20 M52 84 L52 96 M8 52 L20 52 M84 52 L96 52" stroke="${ring}" stroke-width="5" stroke-linecap="round"/>
  <text x="52" y="63" text-anchor="middle" font-size="30" font-weight="900" fill="${fg}" font-family="Segoe UI, Arial, sans-serif">CE</text>`;
}
