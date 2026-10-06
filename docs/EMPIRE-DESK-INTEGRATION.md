# CE VAULT · Empire Desk Integration

## Current production contract

- Canonical backend runtime: **Render**
- Telegram webhook owner: **Render only**
- Operational database: **Supabase**
- GitHub repository: `SHELBYY-21/CE-VAULT-Bot` on `main`
- Canonical Telegram runtime notes: `docs/TELEGRAM-RENDER-LIVE.md`

Railway, Netlify, GitHub Actions tunnels, and Firestore are not production owners and must not be used as automatic fallback targets.

## Empire Desk role

Empire Desk is a presentation and operator interface. It must consume CE VAULT APIs without becoming a second source of truth.

Allowed:

- read coarse system health
- display authorized dashboard data
- trigger approved application actions through server-side CE VAULT APIs
- show Telegram/runtime status returned by the canonical backend

Not allowed:

- storing bot tokens, webhook secrets, API secrets, service-role keys, or other credentials in client-side JavaScript
- repointing Telegram to another host
- bypassing CE VAULT permission, validation, settlement, or database rules
- treating UI state as proof that a financial settlement completed

## Access boundary

Public status endpoints may expose only coarse health information. Financial balances, transactions, receiving-bank data, exports, and write actions require server-verified authorization.

Never expose privileged credentials through `NEXT_PUBLIC_*`, browser storage, query strings, public HTML, logs, or the presentation site.

## Operational state rules

`RECORDED` is not `SETTLED`.

Telegram transport, OCR, ledger recording, database persistence, and settlement verification are separate states. UI components must preserve those distinctions and must not convert an unverified state into a completed financial state.

## Runtime ownership

Empire Desk must resolve backend status from the current Render service configuration. Do not hard-code Railway or Netlify production URLs into the site.

If the production host changes in the future, perform an explicit single-owner migration. Do not run parallel Telegram consumers and do not silently fail over to a legacy host.
