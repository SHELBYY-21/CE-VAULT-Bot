import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'appsrc', 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');

const marker = '/* CE_BRAND_UI_V1 */';
if (source.includes(marker)) {
  console.log('CE brand UI patch already present.');
  process.exit(0);
}

const patch = String.raw`

/* CE_BRAND_UI_V1 */
const CE_BRAND_SVG = \`<svg viewBox="0 0 120 64" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ceg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b4"/><stop offset=".34" stop-color="#ffd96a"/><stop offset=".72" stop-color="#c88a18"/><stop offset="1" stop-color="#fff0a5"/></linearGradient></defs><path fill="url(#ceg)" d="M8 32 28 10h32L48 22H34L25 32l9 10h14l12 12H28L8 32Zm53-22h49L98 22H50L61 10Zm-4 17h47L92 38H46l11-11Zm-7 16h43L81 54H39l11-11Z"/></svg>\`;

const CE_ICON_SVGS = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1v-8.5Z"/></svg>',
  vault: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>',
  tx: '<svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3m3 3-3 3M20 17H7l3 3m-3-3 3-3"/></svg>',
  bank: '<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5H3Zm2 3h14M6 12v6m4-6v6m4-6v6m4-6v6M3 21h18"/></svg>',
  team: '<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14 15c3.4-.4 5.5 1.2 6.5 5"/></svg>',
  ai: '<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="12" rx="4"/><path d="M9 7V4m6 3V4M8 13h.01M16 13h.01M9 17h6"/></svg>',
  report: '<svg viewBox="0 0 24 24"><path d="M5 20V10m5 10V5m5 15v-8m5 8V8"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19 12a7 7 0 0 0-.1-1l2-1.5-2-3.4-2.4 1a7 7 0 0 0-1.7-1L14.5 3h-5L9 6.1a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L5 11a7 7 0 0 0 0 2l-2 1.5 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 3.1h5l.4-3.1a7 7 0 0 0 1.7-1l2.4 1 2-3.4L19 13a7 7 0 0 0 0-1Z"/></svg>',
};

function ceIconFor(text) {
  const t = String(text || '').trim().toLowerCase();
  if (/หน้าหลัก|home/.test(t)) return 'home';
  if (/vault|ฐานข้อมูล/.test(t)) return 'vault';
  if (/ธุรกรรม|transaction|รายการ/.test(t)) return 'tx';
  if (/บัญชี|account|bank/.test(t)) return 'bank';
  if (/ทีมงาน|team/.test(t)) return 'team';
  if (/ai agent|agent/.test(t)) return 'ai';
  if (/รายงาน|report|analytics/.test(t)) return 'report';
  if (/ตั้งค่า|setting/.test(t)) return 'settings';
  return null;
}

function installCEBrandUI() {
  if (document.getElementById('ce-brand-ui-style')) return;
  const style = document.createElement('style');
  style.id = 'ce-brand-ui-style';
  style.textContent = \`
    :root{--ce-bg:#050b14;--ce-bg2:#071626;--ce-panel:rgba(7,18,32,.82);--ce-line:rgba(70,173,255,.22);--ce-blue:#29b6ff;--ce-gold:#f4c85a;--ce-gold2:#b97916;--ce-green:#22e5a1;--ce-text:#f4f8ff;--ce-muted:#8ca0ba}
    html,body{background:radial-gradient(circle at 55% -10%,rgba(36,128,203,.18),transparent 38%),linear-gradient(145deg,var(--ce-bg),var(--ce-bg2) 55%,#03070c)!important;color:var(--ce-text)!important}
    body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(rgba(69,151,222,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(69,151,222,.035) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.75),transparent 90%)}
    .ce-brand-mark{display:inline-flex!important;align-items:center;gap:10px;min-width:max-content}
    .ce-brand-mark svg{width:54px;height:31px;filter:drop-shadow(0 0 12px rgba(244,200,90,.35))}
    .ce-brand-copy{display:flex;flex-direction:column;line-height:1}.ce-brand-copy b{font-size:13px;letter-spacing:.22em;color:#fff}.ce-brand-copy small{margin-top:4px;font-size:8px;letter-spacing:.28em;color:var(--ce-gold)}
    .ce-menu-icon{width:30px;height:30px;display:inline-grid;place-items:center;border-radius:9px;border:1px solid rgba(58,173,255,.26);background:linear-gradient(145deg,rgba(18,49,75,.88),rgba(4,13,24,.9));box-shadow:inset 0 1px rgba(255,255,255,.08),0 0 15px rgba(26,133,225,.08);flex:0 0 auto}
    .ce-menu-icon svg{width:17px;height:17px;fill:none;stroke:#dbeeff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
    .ce-menu-enhanced{display:flex!important;align-items:center!important;gap:10px!important;border-radius:11px!important;transition:transform .16s ease,border-color .16s ease,background .16s ease!important}
    .ce-menu-enhanced:hover{transform:translateX(2px);background:linear-gradient(90deg,rgba(244,200,90,.12),rgba(32,159,255,.06))!important;border-color:rgba(244,200,90,.32)!important}
    .ce-menu-enhanced[aria-current="page"],.ce-menu-enhanced.active,.ce-menu-enhanced.is-active{background:linear-gradient(90deg,rgba(244,200,90,.18),rgba(26,139,227,.10))!important;box-shadow:inset 3px 0 var(--ce-gold),0 0 20px rgba(36,144,235,.08)!important}
    .ce-menu-enhanced[aria-current="page"] .ce-menu-icon,.ce-menu-enhanced.active .ce-menu-icon,.ce-menu-enhanced.is-active .ce-menu-icon{border-color:rgba(244,200,90,.65);box-shadow:0 0 16px rgba(244,200,90,.18)}
    header,nav,aside,[class*="sidebar"],[class*="topbar"],[class*="panel"],[class*="card"],[class*="widget"]{border-color:var(--ce-line)!important}
    [class*="panel"],[class*="card"],[class*="widget"]{background:linear-gradient(150deg,rgba(11,28,46,.88),rgba(4,12,22,.92))!important;box-shadow:inset 0 1px rgba(255,255,255,.035),0 14px 40px rgba(0,0,0,.18)!important;backdrop-filter:blur(18px)}
    button,[role="button"],input,select{border-radius:10px!important}
    button:not(.danger):not([class*="danger"]){border-color:rgba(54,164,246,.25)!important}
    h1,h2,h3,strong{letter-spacing:-.015em}code,[class*="mono"],[class*="amount"]{font-variant-numeric:tabular-nums}
    @media(max-width:720px){.ce-brand-copy{display:none}.ce-brand-mark svg{width:42px}.ce-menu-icon{width:28px;height:28px}.ce-menu-enhanced{gap:6px!important}nav,.bottom-nav,[class*="bottom"]{padding-bottom:max(10px,env(safe-area-inset-bottom))!important}}
    @media(prefers-reduced-motion:reduce){.ce-menu-enhanced{transition:none!important}.ce-menu-enhanced:hover{transform:none!important}}
  \`;
  document.head.appendChild(style);

  const brandCandidates = [...document.querySelectorAll('header *, nav *, aside *, [class*="brand"] *, [class*="logo"] *')];
  for (const el of brandCandidates) {
    if (el.children.length) continue;
    const t = (el.textContent || '').trim().replace(/\\s+/g, ' ');
    if (t === 'CE VAULT' || t === 'CE' || t === 'YOUNGBOSS OS') {
      const holder = document.createElement('span');
      holder.className = 'ce-brand-mark';
      holder.innerHTML = CE_BRAND_SVG + '<span class="ce-brand-copy"><b>CE VAULT</b><small>YOUNGBOSS OS</small></span>';
      el.replaceWith(holder);
      break;
    }
  }

  const candidates = [...document.querySelectorAll('nav a,nav button,aside a,aside button,[class*="sidebar"] a,[class*="sidebar"] button,[class*="bottom"] a,[class*="bottom"] button')];
  for (const el of candidates) {
    if (el.querySelector('.ce-menu-icon')) continue;
    const key = ceIconFor(el.textContent);
    if (!key) continue;
    const icon = document.createElement('span');
    icon.className = 'ce-menu-icon';
    icon.innerHTML = CE_ICON_SVGS[key];
    el.prepend(icon);
    el.classList.add('ce-menu-enhanced');
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installCEBrandUI, { once: true });
else queueMicrotask(installCEBrandUI);
new MutationObserver(() => installCEBrandUI()).observe(document.documentElement, { childList: true, subtree: true });
`;

source += patch;
writeFileSync(mainPath, source);
console.log('Patched CE brand logo, menu icon set and responsive UI layer.');
