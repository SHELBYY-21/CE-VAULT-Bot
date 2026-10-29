# CE VAULT / YOUNGBOSS LIVE — Mobile UX Patch

## Decision record

- **Mode:** Redesign · Preserve / responsive patch. ไม่มี source prototype เดิมผูกอยู่กับ sandbox นี้ จึงสร้างเฉพาะ surface ที่ทำหน้าที่รักษา CE VAULT v1 contract และ visual language ตามข้อกำหนด โดยไม่เพิ่ม workflow, backend หรือ financial capability
- **Preserve:** contract ของ 12 canonical job states, 7-stage rail, demo fixtures, sandbox-only guard, dark aerospace/fintech visual identity, desktop command-center density
- **Improve:** mobile information architecture, touch ergonomics, sticky controls, detail interaction, queue readability, Telegram visibility และ health prioritization
- **Remove from mobile main surface:** control row ที่ล้น, table-like queue, floating detail overlay, long architecture prose
- **Protected contracts:** exact job states; canonical stage order; terminal-state immutability; PROCESSING/SETTLING read-only; Confirm เฉพาะ sandbox; `LIVE_SETTLEMENT_ENABLED=false`; ไม่มี action ที่สื่อ financial movement
- **Highest-risk change:** state preview interaction อาจถูกเข้าใจเป็น workflow mutation จึงแยก "demo preview" ออกจาก record/job state อย่างชัด และไม่เขียน transition ใด ๆ
- **Fallback:** ทุก control ใน prototype เป็น client-side fixture เท่านั้น และ refresh สามารถคืนค่า default ได้โดยไม่มี persistent data

## Design Read

```yaml
artifact: "operator dashboard prototype"
audience: "sandbox operator ที่ต้องดู attention queue และสถานะงานบนมือถือ"
visual-language: "aerospace / fintech command center"
mode: "preserve patch"
visual-variance: 2
motion-intensity: 3
information-density: 7
asset-dependence: 1
brand-fidelity: 9
```

### Design system

- **Design movement:** OLED command console ที่ผสาน high-assurance operations กับ telemetry rail แบบ restrained
- **Core principles:** อ่านสถานะก่อนข้อมูลรอง; state เป็น color-semantic ไม่ใช้สีตกแต่ง; control สำคัญอยู่ใน thumb zone; รายละเอียดลึกอยู่ใน sheet ไม่บังงานหลัก
- **Color philosophy:** deep navy/near-black เป็นพื้นที่ปฏิบัติการ; Cyber Cyan คือ active telemetry; Metallic Gold คือ review/value; green จำกัดเฉพาะ COMPLETED; amber สำหรับ waiting/review/duplicate; red สำหรับ failed/timeout/offline
- **Layout paradigm:** desktop ใช้ command grid สามคอลัมน์; mobile แปลงเป็น single operational stream พร้อม sticky top status และ sticky bottom job entry
- **Signature elements:** hairline luminous frames, telemetry notches, compact stage rail และ dotted ambient signal field
- **Interaction philosophy:** tap มี feedback 180–220ms; controls ไม่ mutate financial/job state; demo switching แสดงว่าเป็น preview
- **Animation:** ambient cyan signal 6s; press 180ms; sheet 280ms; เมื่อ reduced motion เปิดให้เป็น static
- **Typography:** `Space Grotesk` สำหรับ labels/heading และ `IBM Plex Mono` สำหรับ refs, state, time, amount; hierarchy บน mobile เริ่ม 14–16px และไม่ตัด state names
- **Brand essence:** “A sandbox command surface for exception-first transaction operations.” บุคลิก: precise, guarded, nocturnal
- **Brand voice:** กระชับและทำงานได้ เช่น “2 jobs need operator attention.” / “Preview only. No settlement operation is available.”
- **Wordmark & logo:** CE//VAULT wordmark แบบ monospaced split lockup พร้อม squared signal mark สร้างเป็น native interface treatment ไม่อ้างว่าเป็น official external logo
- **Signature brand color:** Cyber Cyan `#35E2E8`

## Implementation approach

Vite single-page operator surface (`index.html` + modular JavaScript + CSS custom properties) พร้อม Node/Express server boundary (`server/index.mjs`). Dashboard hydrate จาก `/api/v1/jobs` และรับ Activity Center ผ่าน SSE เมื่อ Supabase runtime พร้อม; หาก API unavailable จะคง fixture-only fallback โดยไม่ทำให้ mobile shell ล้ม. Server-only Supabase/Telegram secrets ไม่ถูก bundle เข้า browser.

### Project structure

| Path | Responsibility |
| --- | --- |
| `index.html` | semantic app shell และ entry point |
| `src/main.js` | fixture data, read-only contract guards, rendering, menus/sheets, demo interactions |
| `src/styles.css` | desktop baseline และ mobile <=767px composition patch |
| `server/index.mjs` | REST API, SSE, Telegram webhook verification and safe runtime diagnostics |
| `server/domain/` | canonical state transitions and signed callback codec |
| `server/repositories/` | service-role Supabase adapter and official Telegram Bot API adapter |
| `supabase/migrations/` | additive workflow, audit, outbox, idempotency and callback-token schema |
| `tests/` + `scripts/simulate-callback.mjs` | contract and signed callback regression checks |
| `public/manus-routes.json` | route manifest สำหรับ single dashboard route |
| `TODO.md` | acceptance clauses ที่ trace กลับไปยัง brief |
| `brand-spec.md` | identity handling ใน absence of supplied source assets |

## Contract implementation

1. `CANONICAL_STATES` เป็น frozen list 12 ค่าเท่านั้น และ fixtures ครอบคลุมครบทุกค่า
2. `FLOW_STAGES` เป็น frozen list 7 ค่าในลำดับ SCAN → OCR → VERIFY → CONFIRM → PROCESS → SETTLEMENT → DONE
3. Event handlers ไม่เปลี่ยน canonical job state; state chips ใน Telegram เปลี่ยนเฉพาะ `previewState`
4. `PROCESSING`/`SETTLING` มีแต่ refresh/details/audit-type affordances
5. `NEED_CONFIRMATION` แสดง `Confirm (Sandbox)` เฉพาะ in-place demo notice ที่ไม่ mutate job
6. `LIVE_SETTLEMENT_ENABLED` hard-coded `false` ใน client module และหน้าจอแสดง sandbox guard

## Phase 2 evidence

- Supabase additive workflow migration applied to project `iuaaviivkumvzbdmpzty`; new workflow tables are RLS-enabled and service-role-only.
- Public Preview `/api/v1/health`, `/api/v1/jobs`, `/api/v1/activity`, `/api/v1/activity/stream` are served by the server boundary.
- Telegram `getWebhookInfo` returns the current external URL, `pending_update_count: 0`, and `callback_query` in `allowed_updates`.
- Local signed callback simulation confirms `CONFIRM_PROCESS → PROCESSING`, 57-byte callback payload, tamper rejection, and expiry rejection; no external callback was delivered.

---

## Phase 2 — Sandbox-backed workflow integration

### Scope and safety posture

- **Outcome:** เปลี่ยน dashboard จาก fixture-only เป็น projection ของ PostgreSQL/Supabase พร้อม Activity Center SSE และ official Telegram Bot API adapter แบบ sandbox only
- **Source of truth:** Supabase project `Realtime Fintech Operations Platform` ใช้ additive tables `workflow_jobs`, `job_events`, `outbox_messages`, `command_idempotency` และ `telegram_callback_tokens`; `transactions` เดิมจะไม่ถูกแก้หรือใช้แทน canonical v1 state machine
- **Safety:** `CE_VAULT_SANDBOX=true`, `LIVE_SETTLEMENT=false`, `LIVE_SETTLEMENT_ENABLED=false` ต้องผ่านทั้ง runtime config และ database singleton ก่อน mutating command ทุกครั้ง; ไม่มี provider/rail/bank SDK หรือ real-money execution
- **Server boundary:** Node HTTP API ใต้ `/api/v1`, SSE ที่ `/api/v1/activity/stream`, และ Telegram webhook ใต้ `/api/v1/telegram/webhook`; dashboard เรียก API เท่านั้น ไม่เขียน Supabase จาก browser
- **Credential boundary:** `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_CALLBACK_SECRET` มาจาก protected secret input เท่านั้น ไม่ commit ลง repository หรือ output

### Canonical write path

`Telegram / sandbox API → signed callback verification → PostgreSQL RPC with row lock → workflow_jobs + job_events + audit + outbox_messages in one transaction → SSE Activity Center → durable Telegram status-card edit`.

- `workflow_jobs` เก็บ state, version, public reference, masked-value projection, Telegram location และ correlation ID
- `job_events` เป็น append-only state evidence; `outbox_messages` เป็น delivery projection; `command_idempotency` reject reuse conflict/replay safely
- `REFRESH`, `DETAILS`, `RECHECK`, `AUDIT` เป็น read/projection controls; `CONFIRM_PROCESS` เท่านั้นที่ขอ `NEED_CONFIRMATION → PROCESSING` และต้องมี state version + callback gates
- terminal states `COMPLETED`, `FAILED`, `DUPLICATE`, `TIMEOUT` immutable; no `NEED_CONFIRMATION → VERIFYING`; no UI/Bot action named `SETTLE`, `PAY`, `TRANSFER`, `PAYOUT`, `LIVE`

### API resource design

| Route | Purpose |
| --- | --- |
| `GET /api/v1/jobs` | attention-first projected jobs with bounded pagination |
| `POST /api/v1/jobs` | create synthetic `IDLE` sandbox job only |
| `GET /api/v1/jobs/:id` | safe job detail + audit projection |
| `POST /api/v1/jobs/:id/commands` | allow-listed sandbox command with expected version + idempotency key |
| `GET /api/v1/activity` | latest activity projection |
| `GET /api/v1/activity/stream` | SSE for durable outbox events |
| `GET /api/v1/telegram/status` | token-gated diagnostic view of Telegram `getWebhookInfo` |
| `POST /api/v1/telegram/webhook` | verified Telegram update receiver; header gate precedes JSON parsing |

### Project structure additions

| Path | Responsibility |
| --- | --- |
| `server/index.mjs` | Node/Vite runtime, REST routes, SSE broadcast and safe errors |
| `server/domain/` | canonical state contract, transition and callback cryptography |
| `server/repositories/` | Supabase RPC/data adapters and Telegram card projections |
| `supabase/migrations/` | additive PostgreSQL schema and atomic RPC functions |
| `docs/api-v1.md` | resource/API contract and runtime/config boundaries |
| `tests/` | transition, callback, idempotency and sandbox guard regression tests |

### Explicit non-goals

No live settlement, no provider credentials, no money movement, no dashboard header role trust, no Telegram webhook registration until token/runtime verification and user confirmation for that external registration.
