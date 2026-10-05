import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'appsrc', 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');
const marker = '/* CE_BRAND_UI_V3 */';
if (source.includes(marker)) process.exit(0);

const css = [
  ':root{--ce-bg:#050b14;--ce-bg2:#071626;--ce-line:rgba(70,173,255,.22);--ce-blue:#29b6ff;--ce-gold:#f4c85a;--ce-text:#f4f8ff}',
  'html,body{background:radial-gradient(circle at 55% -10%,rgba(36,128,203,.18),transparent 38%),linear-gradient(145deg,var(--ce-bg),var(--ce-bg2) 55%,#03070c)!important;color:var(--ce-text)!important}',
  'body:before{content:"";position:fixed;inset:0;pointer-events:none;z-index:-1;background-image:linear-gradient(rgba(69,151,222,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(69,151,222,.035) 1px,transparent 1px);background-size:32px 32px}',
  '.ce-brand-mark{display:inline-flex!important;align-items:center;gap:10px}.ce-brand-mark svg{width:54px;height:31px;filter:drop-shadow(0 0 12px rgba(244,200,90,.35))}',
  '.ce-brand-copy{display:flex;flex-direction:column;line-height:1}.ce-brand-copy b{font-size:13px;letter-spacing:.22em;color:#fff}.ce-brand-copy small{margin-top:4px;font-size:8px;letter-spacing:.28em;color:var(--ce-gold)}',
  '.ce-menu-icon{width:30px;height:30px;display:inline-grid;place-items:center;border-radius:9px;border:1px solid rgba(58,173,255,.26);background:linear-gradient(145deg,rgba(18,49,75,.88),rgba(4,13,24,.9));flex:0 0 auto}',
  '.ce-menu-icon svg{width:17px;height:17px;fill:none;stroke:#dbeeff;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}',
  '.ce-menu-enhanced{display:flex!important;align-items:center!important;gap:10px!important;border-radius:11px!important;transition:.16s ease!important}',
  '.ce-menu-enhanced:hover{transform:translateX(2px);background:linear-gradient(90deg,rgba(244,200,90,.12),rgba(32,159,255,.06))!important}',
  '.ce-menu-enhanced[aria-current="page"],.ce-menu-enhanced.active,.ce-menu-enhanced.is-active{background:linear-gradient(90deg,rgba(244,200,90,.18),rgba(26,139,227,.10))!important;box-shadow:inset 3px 0 var(--ce-gold)!important}',
  'header,nav,aside,[class*="sidebar"],[class*="topbar"],[class*="panel"],[class*="card"],[class*="widget"]{border-color:var(--ce-line)!important}',
  '[class*="panel"],[class*="card"],[class*="widget"]{background:linear-gradient(150deg,rgba(11,28,46,.88),rgba(4,12,22,.92))!important;box-shadow:inset 0 1px rgba(255,255,255,.035),0 14px 40px rgba(0,0,0,.18)!important;backdrop-filter:blur(18px)}',
  'button,[role="button"],input,select{border-radius:10px!important}',
  'code,[class*="mono"],[class*="amount"]{font-variant-numeric:tabular-nums}',
  '@media(max-width:720px){.ce-brand-copy{display:none}.ce-brand-mark svg{width:42px}.ce-menu-icon{width:28px;height:28px}.ce-menu-enhanced{gap:6px!important}nav,.bottom-nav,[class*="bottom"]{padding-bottom:max(10px,env(safe-area-inset-bottom))!important}}',
  '@media(prefers-reduced-motion:reduce){.ce-menu-enhanced{transition:none!important}.ce-menu-enhanced:hover{transform:none!important}}'
].join('');

const brandSvg = '<svg viewBox="0 0 120 64" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="ceg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2b4"/><stop offset=".34" stop-color="#ffd96a"/><stop offset=".72" stop-color="#c88a18"/><stop offset="1" stop-color="#fff0a5"/></linearGradient></defs><path fill="url(#ceg)" d="M8 32 28 10h32L48 22H34L25 32l9 10h14l12 12H28L8 32Zm53-22h49L98 22H50L61 10Zm-4 17h47L92 38H46l11-11Zm-7 16h43L81 54H39l11-11Z"/></svg>';
const icons = {
  home:'<svg viewBox="0 0 24 24"><path d="M3 11.5 12 4l9 7.5V20H15v-6H9v6H3Z"/></svg>',
  vault:'<svg viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="7" ry="3"/><path d="M5 5v7c0 1.7 3.1 3 7 3s7-1.3 7-3V5M5 12v7c0 1.7 3.1 3 7 3s7-1.3 7-3v-7"/></svg>',
  tx:'<svg viewBox="0 0 24 24"><path d="M4 7h13l-3-3m3 3-3 3M20 17H7l3 3m-3-3 3-3"/></svg>',
  bank:'<svg viewBox="0 0 24 24"><path d="m3 9 9-5 9 5H3Zm2 3h14M6 12v6m4-6v6m4-6v6m4-6v6M3 21h18"/></svg>',
  team:'<svg viewBox="0 0 24 24"><circle cx="9" cy="8" r="3"/><circle cx="17" cy="9" r="2.5"/><path d="M3.5 20c.6-4 2.4-6 5.5-6s4.9 2 5.5 6M14 15c3.4-.4 5.5 1.2 6.5 5"/></svg>',
  ai:'<svg viewBox="0 0 24 24"><rect x="5" y="7" width="14" height="12" rx="4"/><path d="M9 7V4m6 3V4M8 13h.01M16 13h.01M9 17h6"/></svg>',
  report:'<svg viewBox="0 0 24 24"><path d="M5 20V10m5 10V5m5 15v-8m5 8V8"/></svg>',
  settings:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2"/></svg>'
};

const lines = [];
lines.push('', marker);
lines.push('const CE_BRAND_SVG='+JSON.stringify(brandSvg)+';');
lines.push('const CE_ICON_SVGS='+JSON.stringify(icons)+';');
lines.push('const CE_BRAND_CSS='+JSON.stringify(css)+';');
lines.push('function ceIconFor(text){const t=String(text||"").trim().toLowerCase();if(/หน้าหลัก|home/.test(t))return"home";if(/vault|ฐานข้อมูล/.test(t))return"vault";if(/ธุรกรรม|transaction|รายการ/.test(t))return"tx";if(/บัญชี|account|bank/.test(t))return"bank";if(/ทีมงาน|team/.test(t))return"team";if(/ai agent|agent/.test(t))return"ai";if(/รายงาน|report|analytics/.test(t))return"report";if(/ตั้งค่า|setting/.test(t))return"settings";return null;}');
lines.push('function installCEBrandUI(){if(!document.getElementById("ce-brand-ui-style")){const s=document.createElement("style");s.id="ce-brand-ui-style";s.textContent=CE_BRAND_CSS;document.head.appendChild(s);}const brand=[...document.querySelectorAll("header *,nav *,aside *,[class*=brand] *,[class*=logo] *")];for(const el of brand){if(el.children.length)continue;const t=(el.textContent||"").trim().replace(/\\s+/g," ");if(t==="CE VAULT"||t==="CE"||t==="YOUNGBOSS OS"){const h=document.createElement("span");h.className="ce-brand-mark";const icon=document.createElement("span");icon.innerHTML=CE_BRAND_SVG;while(icon.firstChild)h.appendChild(icon.firstChild);const copy=document.createElement("span");copy.className="ce-brand-copy";const b=document.createElement("b");b.textContent="CE VAULT";const small=document.createElement("small");small.textContent="YOUNGBOSS OS";copy.appendChild(b);copy.appendChild(small);h.appendChild(copy);el.replaceWith(h);break;}}const items=[...document.querySelectorAll("nav a,nav button,aside a,aside button,[class*=sidebar] a,[class*=sidebar] button,[class*=bottom] a,[class*=bottom] button")];for(const el of items){if(el.querySelector(".ce-menu-icon"))continue;const key=ceIconFor(el.textContent);if(!key)continue;const i=document.createElement("span");i.className="ce-menu-icon";i.innerHTML=CE_ICON_SVGS[key];el.prepend(i);el.classList.add("ce-menu-enhanced");}}');
lines.push('if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",installCEBrandUI,{once:true});else queueMicrotask(installCEBrandUI);');
lines.push('new MutationObserver(function(){installCEBrandUI();}).observe(document.documentElement,{childList:true,subtree:true});','');

source += lines.join('\n');
writeFileSync(mainPath, source);
console.log('Patched CE brand logo, menu icon set and responsive UI layer.');
