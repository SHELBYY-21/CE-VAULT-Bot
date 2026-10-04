// Official CE EMPIRE mascot — the crowned navy/gold robot.
// อ้างอิง: ภาพ reference ที่ผู้ใช้ให้มา (docs/mascot-motion-lock.md)
// ตัวตั้งแต่ง: บอดี้เมทัลลิกเงิน/กรมท่า · มงกุฎและเกราะทอง · ตาส่องสี cyan
// · ป้าย CE สีทองกลางอก · ฮาโลแสงวงกลมสี cyan
// ใช้ร่วมกันทั้ง sticker WEBM render (scripts/render-mascot-webm.mjs)
// และ preview (docs/design/mascot-preview.html) — ห้ามแยกสองแบบ

export const CE_MASCOT_COLORS = {
  navy: '#0C1520',
  navyDark: '#05090E',
  navyLight: '#152030',
  silver: '#C9D2DC',
  silverDark: '#8B97A5',
  gold: '#F0B429',
  goldLight: '#FFD766',
  goldDark: '#C58F1A',
  cyan: '#00D4FF',
  green: '#00E676',
  red: '#FF5252',
};

// ── สีหน้าตา: happy · focused · closed · sad · wink · wide ──
function ceFace(exp) {
  let eyes = '';
  let mouth = '';
  if (exp === 'happy') {
    eyes = '<ellipse cx="35" cy="42" rx="5.5" ry="7" fill="#00D4FF"/><ellipse cx="53" cy="42" rx="5.5" ry="7" fill="#00D4FF"/>' +
      '<circle cx="36.8" cy="39.5" r="1.8" fill="#fff"/><circle cx="54.8" cy="39.5" r="1.8" fill="#fff"/>';
    mouth = '<path d="M38 50 Q44 54.5 50 50" stroke="#05090E" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  } else if (exp === 'focused') {
    eyes = '<ellipse cx="35" cy="42" rx="5" ry="6" fill="#00D4FF"/><ellipse cx="53" cy="42" rx="5" ry="6" fill="#00D4FF"/>' +
      '<circle cx="36" cy="40.5" r="1.5" fill="#fff"/><circle cx="54" cy="40.5" r="1.5" fill="#fff"/>' +
      '<path d="M29 35.5 L40 37.5" stroke="#8B97A5" stroke-width="1.8" stroke-linecap="round"/>' +
      '<path d="M59 35.5 L48 37.5" stroke="#8B97A5" stroke-width="1.8" stroke-linecap="round"/>';
    mouth = '<path d="M40 51 L48 51" stroke="#05090E" stroke-width="2.2" stroke-linecap="round"/>';
  } else if (exp === 'closed') {
    eyes = '<path d="M29.5 42 Q35 38 40.5 42" stroke="#00D4FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M47.5 42 Q53 38 58.5 42" stroke="#00D4FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M38 50 Q44 55 50 50" stroke="#05090E" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  } else if (exp === 'sad') {
    eyes = '<path d="M29.5 41 Q35 45 40.5 41" stroke="#00D4FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M47.5 41 Q53 45 58.5 41" stroke="#00D4FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<circle cx="62" cy="48" r="2.2" fill="#00D4FF" opacity=".8"/>';
    mouth = '<path d="M39 53 Q44 49.5 49 53" stroke="#05090E" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  } else if (exp === 'wink') {
    eyes = '<ellipse cx="35" cy="42" rx="5.5" ry="7" fill="#00D4FF"/><circle cx="36.8" cy="39.5" r="1.8" fill="#fff"/>' +
      '<path d="M47.5 42 Q53 38.5 58.5 42" stroke="#00D4FF" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    mouth = '<path d="M38 50 Q44 54.5 50 50" stroke="#05090E" stroke-width="2.2" fill="none" stroke-linecap="round"/>';
  } else if (exp === 'wide') {
    eyes = '<ellipse cx="35" cy="42" rx="6.5" ry="8" fill="#00D4FF"/><ellipse cx="53" cy="42" rx="6.5" ry="8" fill="#00D4FF"/>' +
      '<circle cx="35" cy="42.5" r="2.6" fill="#05090E"/><circle cx="53" cy="42.5" r="2.6" fill="#05090E"/>';
    mouth = '<ellipse cx="44" cy="51.5" rx="4" ry="2.6" fill="#05090E"/>';
  }
  return { eyes, mouth };
}

// ── ตัวหุ่นยนต์ (viewBox 88x96) ──
// opts.armL / opts.armR = องศาหมุนแขนซ้าย/ขวารอบจุดไหล่ (ใช้ทำท่า hi/scan/work)
export function ceRobotSvg(exp = 'happy', opts = {}) {
  const armL = opts.armL || 0;
  const armR = opts.armR || 0;
  const face = ceFace(exp);
  return `<g>
  <circle cx="44" cy="38" r="33" fill="none" stroke="#00D4FF" stroke-opacity=".14" stroke-width="2.5"/>
  <circle cx="44" cy="38" r="30" fill="none" stroke="#00D4FF" stroke-opacity=".10" stroke-width="1.4" stroke-dasharray="5,7"/>
  <path d="M30 21 L28 8 L36 13 L44 4 L52 13 L60 8 L58 21 Z" fill="#F0B429" stroke="#C58F1A" stroke-width="1.2" stroke-linejoin="round"/>
  <path d="M31.5 19 L30 10.5" stroke="#FFD766" stroke-width="1.6" stroke-linecap="round"/>
  <circle cx="28" cy="8" r="2" fill="#FFD766"/><circle cx="44" cy="4" r="2" fill="#FFD766"/><circle cx="60" cy="8" r="2" fill="#FFD766"/>
  <path d="M16 42 Q16 19 44 19 Q72 19 72 42 L72 53 Q44 61 16 53 Z" fill="#0C1520" stroke="#8B97A5" stroke-width="1.2"/>
  <path d="M20 30 Q24 22 34 21" stroke="#152030" stroke-width="2.4" fill="none" stroke-linecap="round" opacity=".9"/>
  <rect x="24" y="30" width="40" height="24" rx="11" fill="#C9D2DC"/>
  <path d="M26 49 Q44 54 62 49 L62 52.5 Q44 57.5 26 52.5 Z" fill="#8B97A5" opacity=".3"/>
  <rect x="8" y="40" width="8" height="14" rx="4" fill="#05090E" stroke="#00D4FF" stroke-width="1.1"/>
  <rect x="72" y="40" width="8" height="14" rx="4" fill="#05090E" stroke="#00D4FF" stroke-width="1.1"/>
  <circle cx="12" cy="47" r="1.9" fill="#00D4FF"/><circle cx="76" cy="47" r="1.9" fill="#00D4FF"/>
  ${face.eyes}${face.mouth}
  <rect x="38" y="57" width="12" height="5" rx="1.6" fill="#8B97A5"/>
  <path d="M26 63 Q44 58 62 63 L65.5 84 Q44 91 22.5 84 Z" fill="#0C1520" stroke="#05090E" stroke-width="1.2"/>
  <circle cx="23" cy="63" r="5.4" fill="#F0B429" stroke="#C58F1A" stroke-width="1.1"/>
  <circle cx="65" cy="63" r="5.4" fill="#F0B429" stroke="#C58F1A" stroke-width="1.1"/>
  <g transform="rotate(${armL} 22 66)"><path d="M22 66 Q16 74 16.5 83" stroke="#C9D2DC" stroke-width="6.5" fill="none" stroke-linecap="round"/><circle cx="16.5" cy="85" r="4.6" fill="#F0B429" stroke="#C58F1A" stroke-width="1"/></g>
  <g transform="rotate(${armR} 66 66)"><path d="M66 66 Q72 74 71.5 83" stroke="#C9D2DC" stroke-width="6.5" fill="none" stroke-linecap="round"/><circle cx="71.5" cy="85" r="4.6" fill="#F0B429" stroke="#C58F1A" stroke-width="1"/></g>
  <rect x="33" y="66" width="22" height="15" rx="4.5" fill="#F0B429" stroke="#C58F1A" stroke-width="1.1"/>
  <text x="44" y="77.5" text-anchor="middle" font-size="10" font-weight="900" fill="#05090E" font-family="Arial, Helvetica, sans-serif">CE</text>
  <path d="M29 81 H33" stroke="#00D4FF" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
  <path d="M55 81 H59" stroke="#00D4FF" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>
  <rect x="33" y="87" width="9" height="8" rx="3" fill="#05090E"/>
  <rect x="46" y="87" width="9" height="8" rx="3" fill="#05090E"/>
</g>`;
}

// ── Canvas 400x400 สำหรับ sticker — หุ่นกึ่งกลาง + prop ในพิกัด world 0-400 ──
const STICKER_BASE_SCALE = 3.6;
const STICKER_TX = 42;
const STICKER_TY = 32;

export function ceRobotSticker({ exp = 'happy', ty = 0, rot = 0, armL = 0, armR = 0, propSvg = '' } = {}) {
  return `<svg width="512" height="512" viewBox="0 0 400 400" xmlns="http://www.w3.org/2000/svg">
  <g transform="translate(${STICKER_TX},${STICKER_TY + ty}) rotate(${rot}) scale(${STICKER_BASE_SCALE})">
    ${ceRobotSvg(exp, { armL, armR })}
  </g>
  ${propSvg}
</svg>`;
}
