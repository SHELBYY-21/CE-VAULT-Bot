# CE VAULT · Empire Desk Site Integration

**Canonical presentation site:** https://ce-vault-empire-desk.ce-ceo21.chatgpt.site
**Railway Next.js/API:** https://ce-vault-web-production.up.railway.app
**GitHub:** SHELBYY-21/CE-VAULT-Bot (main)
**Data source:** existing Firebase Firestore. Do not migrate/recreate the financial ledger.

The user-owned ChatGPT Site is active at source version 3, project `appgprj_6ab9f97547a48191b3f30a7faa545e2f`. Its library text projection lists Overview, Transactions, Receiving Banks, Reports, Monitor, Settings, Guide, four Quick Actions, five transaction-flow stages and a CE Companion. A text projection is **not editable site source code** and does not prove a working live financial session.

## Integration sequence

1. Use the ChatGPT Site as the visual entry point and design authority. Until its source is edited using a compatible Sites authoring surface, the UI lives at its current published domain; changes committed to this repository update only the Railway app, **not** the chatgpt.site project.
2. The backend exposes `GET /api/empire-desk/status` to the Site's exact origin via CORS. It publishes coarse online/Firestore booleans, never balances, admin records, credentials, SQL/Firebase error strings or webhook secrets. This is a connectivity probe **not** authentication.
3. The site's Monitor panel may call this URL using `fetch('https://ce-vault-web-production.up.railway.app/api/empire-desk/status', {cache:'no-store'})`; a non-200 response means not ready, not a zero transaction balance.
4. The financial API currently at `GET /api/dashboard/data` directly returns transactions and admin records without an authentication gate. **Do not** CORS-enable or call it from the public ChatGPT Site. Restrict it behind a server-verified login/session and authorize each request before enabling any live balance, transaction, account or export component in the external Site.
5. Never put `API_SECRET`, `BOT_TOKEN`, `FIREBASE_SERVICE_ACCOUNT_JSON` or third-party AP
I keys in client-side JavaScript or `NEXT_PUBLIC_*`.
6. For operational access pending authenticated integration, the Site can link users to the Render Dashboard **only after** dashboard authorization is implemented; a link itself is not access control.
7. Keep `RECORDED` distinct from `SETTLED`. The existing legacy `completed` status is not automatically proof of full settlement. Do not show demo data from the reference HTML as production data.
8. Telegram webhook cutover remains separate from frontend design integration; avoid switching or deleting existing webhook during UI deploy.

## Visual / navigation mapping
| Site area | Existing Render path or API | Constraint |
|---|---|---|
| Empire Overview | `/dashboard` | Auth needed before displaying financial data |
| Transactions | `/dashboard` and transaction detail | Server-side session + room authorization required |
| Receiving banks | Existing bank logic | Bank pinned-for-date != native Telegram pinned messages |
| Reports | `/dashboard` and CSV export | Authenticate and limit by room/role |
| Monitor | `/api/empire-desk/status` | Public coarse status only |
| OCR / Settlement quick actions | Existing bot/API workflow | No action reimplementation or financial changes in UI-only integration |

## Deploy acceptance
- GitHub Typecheck, ESLint, tests, E2E, build all pass.
- Railway new commit is live; `/api/empire-desk/status` returns online and a truthful Firestore boolean.
- The public site displays connection status without exposing finance.
- A missing/unverified session shows no financial information, not fabricated zeroes.
- Source sites editing + authenticated finance integration is a distinct next phase.


## Minimal Site Editor insertion — safe Monitor widget

When editing the actual user-owned ChatGPT Site (`appgprj_6ab9f97547a48191b3f30a7faa545e2f`), add the following HTML to its Monitor / การเชื่อมต่อ panel **if the site authoring surface supports custom HTML and external scripts**. This changes the act
ual Site only when applied through its editor; committing this snippet to GitHub alone does not change a chatgpt.site project.

```html
<div data-ce-vault-monitor role="status" aria-live="polite">
  กำลังตรวจสอบการเชื่อมต่อ CE VAULT…
</div>
<script>window.CE_DESK_STATUS_URL = 'https://ce-vault-web-production.up.railway.app/api/empire-desk/status';</script>
<script defer src="https://ce-vault-web-production.up.railway.app/empire-desk-monitor.js"></script>
```

The script reads only `window.CE_DESK_STATUS_URL` (the backend `/api/empire-desk/status`), never `/api/dashboard/data`. Its displayed states are connected (backend and Firebase verified), degraded (backend available but Firebase not verified), and unverified (request failed, timed out, unexpected, or unsupported). It cannot authenticate a user or prove Telegram webhook delivery. No token or personally identifiable or financial data belongs in this client-side snippet.

**Live financial cards must remain unavailable without server-verified user/room authorization.** In particular, do not try to solve cross-origin Site auth by pasting `API_SECRET` into a JavaScript variable or localStorage.

## Dashboard access boundary — staging / first rollout

Sensitive dashboard endpoints now require a signed, 4-hour HttpOnly SameSite=Strict cookie. Configure BOTH server-only Railway environment variables before using /login:

- `DASHBOARD_ACCESS_PASSPHRASE`: unique strong phrase, **at least 12 characters**, not Telegram, API_SECRET, an old PIN or any credential ever pasted in chat.
- `DASHBOARD_SESSION_SECRET`: cryptographically random 32+ characters; separate from the access passphrase.

Missing/weak values fail closed, so users see the login's configuration warning rather than raw ledger data. After env update Railway triggers a redeploy. Visit /login and authenticate; only then can /dashboard, /dashboard/transactions/[id] and /api/dashboard/data show transactions. /api/export permits that signed dashboard session or a separately configured valid legacy API_SECRET; missing API_SECRET grants no access. The completion POST also requires same-origin signed dashboard session or a
 valid configured server API key. Production API writes and cron routes fail closed without API_SECRET.

This is a staging single-instance passphrase/session boundary, **not yet a per-operator RBAC or an SSO bridge**; do not claim room-level permissions or expose financial reads inside chatgpt.site until identity/role verification and a secure same-origin backend-for-frontend are implemented. The cross-origin status probe remains non-sensitive. No financial calculations, settlement state machine, Firebase data, Telegram token or webhook is changed.
