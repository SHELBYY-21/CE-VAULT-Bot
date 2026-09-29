/* CE VAULT Empire Desk · status-only browser bridge (no credentials or financial data).
   Embed only in the owned CE Empire Desk Site. Missing target means no-op. */
(() => {
  'use strict';
  const endpoint = 'https://ce-vault-menu-first.onrender.com/api/empire-desk/status';
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
        if (response.ok && value.online === true && value.firestore === true) {
          update('connected', 'Render ออนไลน์ · Firebase เชื่อมต่อแล้ว');
        } else if (value.online === true) {
          update('degraded', 'Render ออนไลน์ · Firebase ยังไม่ผ่านการตรวจสอบ');
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
