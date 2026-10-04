/* CE VAULT Empire Desk · status-only browser bridge (no credentials or financial data).
   Embed only in the owned CE Empire Desk Site. Missing target means no-op.
   Backend endpoint: set window.CE_DESK_STATUS_URL to the CE VAULT public origin
   (Railway, e.g. https://<service>-xxxx.up.railway.app/api/empire-desk/status)
   before loading this script; same-origin /api/empire-desk/status is the default. */
(() => {
  'use strict';
  const configured = typeof window.CE_DESK_STATUS_URL === 'string' && window.CE_DESK_STATUS_URL.trim();
  const endpoint = configured ? window.CE_DESK_STATUS_URL.trim() : '/api/empire-desk/status';
  const init = () => {
    const box = document.querySelector('[data-ce-vault-monitor]');
    if (!box) return;
    const update = (state, message) => {
      box.dataset.state = state;
      box.textContent = message;
    };
    update('checking', 'กำลังตรวจสอบการเชื่อมต่อ CE VAULT…');
    const abort = new window.AbortController();
    const timeout = setTimeout(() => abort.abort(), 12000);
    fetch(endpoint, { method: 'GET', mode: 'cors', cache: 'no-store', signal: abort.signal })
      .then(async response => {
        let value;
        try { value = await response.json(); } catch { value = null; }
        if (!value || value.service !== 'ce-vault-render') {
          update('unverified', 'ยังยืนยันการเชื่อมต่อ Backend ไม่ได้');
          return;
        }
        const dbOk = value.db === true || value.firestore === true;
        if (response.ok && value.online === true && dbOk) {
          update('connected', 'Backend ออนไลน์ · ฐานข้อมูลเชื่อมต่อแล้ว');
        } else if (value.online === true) {
          update('degraded', 'Backend ออนไลน์ · ฐานข้อมูลยังไม่ผ่านการตรวจสอบ');
        } else {
          update('unverified', 'ยังยืนยันการเชื่อมต่อ Backend ไม่ได้');
        }
      })
      .catch(() => update('unverified', 'ตรวจสถานะไม่สำเร็จ — โปรดลองใหม่ภายหลัง'))
      .finally(() => window.clearTimeout(timeout));
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();