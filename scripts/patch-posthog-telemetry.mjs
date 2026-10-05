import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainPath = path.join(root, 'appsrc', 'src', 'main.js');
let source = readFileSync(mainPath, 'utf8');
const marker = '/* CE_POSTHOG_TELEMETRY_V1 */';
if (source.includes(marker)) process.exit(0);

const telemetry = String.raw`
/* CE_POSTHOG_TELEMETRY_V1 */
const CE_PH_KEY = import.meta.env.VITE_PUBLIC_POSTHOG_KEY || '';
const CE_PH_HOST = (import.meta.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
const CE_APP_VERSION = import.meta.env.VITE_CE_APP_VERSION || 'preview';

function ceAnalyticsDistinctId(){
  const key='ce_analytics_anon_id';
  let id=sessionStorage.getItem(key);
  if(!id){id='ce-anon-'+(globalThis.crypto?.randomUUID?.()||Math.random().toString(36).slice(2));sessionStorage.setItem(key,id);}
  return id;
}
function ceDeviceClass(){return matchMedia('(max-width: 720px)').matches?'mobile':'desktop';}
function ceSafeScreen(){const p=location.pathname||'/';return p.slice(0,80);}
function ceCapture(event, props={}){
  if(!CE_PH_KEY||!event)return;
  const properties={
    distinct_id:ceAnalyticsDistinctId(),
    $process_person_profile:false,
    sandbox:true,
    screen:ceSafeScreen(),
    device_class:ceDeviceClass(),
    app_version:CE_APP_VERSION,
    ...props
  };
  fetch(CE_PH_HOST+'/capture/',{
    method:'POST',
    headers:{'content-type':'application/json'},
    keepalive:true,
    body:JSON.stringify({api_key:CE_PH_KEY,event,properties})
  }).catch(()=>{});
}
function ceActionKey(el){
  const analytics=(el.closest?.('[data-ce-analytics]')?.getAttribute('data-ce-analytics')||'').toLowerCase();
  if(/^[a-z0-9_-]{1,40}$/.test(analytics))return analytics;
  const t=(el.closest?.('a,button,[role=button]')?.textContent||'').toLowerCase();
  if(/home|หน้าหลัก/.test(t))return'home';
  if(/vault|ฐานข้อมูล/.test(t))return'vault';
  if(/transaction|ธุรกรรม|รายการ/.test(t))return'transactions';
  if(/account|bank|บัญชี/.test(t))return'bank';
  if(/team|ทีมงาน/.test(t))return'team';
  if(/agent|ai/.test(t))return'ai';
  if(/report|analytics|รายงาน/.test(t))return'report';
  if(/setting|ตั้งค่า/.test(t))return'settings';
  if(/confirm|ยืนยัน/.test(t))return'confirm';
  if(/cancel|ยกเลิก/.test(t))return'cancel';
  if(/add|เพิ่ม/.test(t))return'add';
  if(/save|บันทึก/.test(t))return'save';
  return'other';
}
function installCEAnalytics(){
  ceCapture('ce_screen_viewed');
  document.addEventListener('click',(event)=>{
    const target=event.target instanceof Element?event.target:null;
    const control=target?.closest?.('a,button,[role=button]');
    if(!control)return;
    const action=ceActionKey(control);
    const nav=!!control.closest('nav,aside,[class*=sidebar],[class*=bottom]');
    ceCapture(nav?'ce_nav_clicked':'ce_action_started',{action});
  },{capture:true});
  window.addEventListener('error',(event)=>{ceCapture('ce_ui_error_seen',{result:'error',error_kind:event.error?.name||'Error'});});
  window.addEventListener('unhandledrejection',(event)=>{ceCapture('ce_ui_error_seen',{result:'rejection',error_kind:event.reason?.name||typeof event.reason||'unknown'});});
  setTimeout(async()=>{
    try{
      const r=await fetch('/api/v1/health',{headers:{accept:'application/json'}});
      ceCapture('ce_runtime_health_seen',{result:r.ok?'ok':'error',state:String(r.status)});
    }catch{ceCapture('ce_runtime_health_seen',{result:'unreachable',state:'network'});}
  },1200);
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',installCEAnalytics,{once:true});else queueMicrotask(installCEAnalytics);
`;

source += '\n' + marker + '\n' + telemetry + '\n';
writeFileSync(mainPath, source);
console.log('Patched privacy-safe PostHog telemetry for CE VAULT preview.');
