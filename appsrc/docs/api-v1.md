# CE VAULT Workflow API v1

> **Sandbox only.** `CE_VAULT_SANDBOX=true`, `LIVE_SETTLEMENT=false`, and `LIVE_SETTLEMENT_ENABLED=false` are mandatory on every mutating path. No route invokes a banking, wallet, payout, transfer, or provider adapter.

## Resources

| Resource | Ownership | Notes |
| --- | --- | --- |
| `workflow_jobs` | PostgreSQL source of truth | Exact 12 canonical states, monotonic `state_version`, terminal records immutable |
| `job_events` | Append-only audit evidence | State transition, Telegram-card and callback-rejection events |
| `outbox_messages` | Durable projection queue | Activity SSE reads claimed state-change messages |
| `telegram_callback_tokens` | Callback gate | Signed callback reference, HMAC nonce digest, binding digest, expiry and one-use claim |

## Routes

| Method | Route | Purpose | Gate |
| --- | --- | --- | --- |
| `GET` | `/api/v1/health` | Safe runtime/configuration status | None |
| `GET` | `/api/v1/jobs?limit=25` | Bounded attention-first projection | Server configuration |
| `GET` | `/api/v1/jobs/:id` | Job plus audit projection | Server configuration |
| `POST` | `/api/v1/jobs` | Create synthetic sandbox job | `X-CE-Sandbox-Key` |
| `POST` | `/api/v1/jobs/:id/commands` | `CONFIRM_PROCESS` only; optimistic version + idempotency | `X-CE-Sandbox-Key` |
| `GET` | `/api/v1/activity` | Recent durable events | Server configuration |
| `GET` | `/api/v1/activity/stream` | SSE outbox projection | Server configuration |
| `GET` | `/api/v1/telegram/status` | Server-side `getWebhookInfo`, never exposes token | Telegram token configured |
| `POST` | `/api/v1/telegram/webhook` | Official Telegram update receiver | Secret header before JSON parsing |
| `POST` | `/api/telegram/webhook` | Compatibility alias for the currently registered Telegram webhook path | Same secret gate |

## Command semantics

`CONFIRM_PROCESS` is the only dashboard/bot mutation command. It requires:

1. job state exactly `NEED_CONFIRMATION`;
2. expected `state_version` matching the locked DB record;
3. unique idempotency key; same key with different request hash returns conflict;
4. explicit sandbox safety flags; and
5. an allowed signed Telegram callback when origin is Telegram.

It performs `NEED_CONFIRMATION → PROCESSING`. `NEED_CONFIRMATION → VERIFYING` is rejected. `COMPLETED`, `FAILED`, `DUPLICATE`, and `TIMEOUT` never transition.

## Telegram callback data

Format: `c1.<action>.j.<ref>.<nonce>.<expires>.<binding>.<hmac>`.

- max 64 UTF-8 bytes (Telegram callback limit)
- supported actions: `REFRESH`, `DETAILS`, `CONFIRM_PROCESS`, `RECHECK`, `AUDIT`
- HMAC signature uses `TELEGRAM_CALLBACK_SECRET`; expiry and chat/message binding are checked before a one-use database claim
- stale, tampered and replayed callbacks are acknowledged safely without repeating a state change

## Error contract

Errors use `application/problem+json`, an `X-Request-ID` response header and stable codes: `SANDBOX_MODE_REQUIRED`, `LIVE_SETTLEMENT_MUST_BE_FALSE`, `STATE_VERSION_STALE`, `TERMINAL_STATE_IMMUTABLE`, `INVALID_STATE_TRANSITION`, `CALLBACK_SIGNATURE_INVALID`, `CALLBACK_EXPIRED`, `CALLBACK_STALE`, and `IDEMPOTENCY_KEY_CONFLICT`.

## Webhook registration boundary

The application can inspect `getWebhookInfo` only when a runtime token exists. It does **not** call `setWebhook`; registration changes an external Telegram configuration and requires an explicit user-approved URL and secret at that later step.
