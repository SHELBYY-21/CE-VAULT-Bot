# CE VAULT · Bot Reply Design Lock v1.0

**Source of truth:** supplied `ce-vault-messages.html`, MSG-01…MSG-30.
**Implementation:** `src/lib/ceReplyTheme.ts`, `src/lib/liveMessage.ts`,
`src/lib/botUi.ts`, `app/api/telegram/webhook/route.ts`.

## Integration boundary

- Preserve the current Next.js/TypeScript webhook and Firebase transaction/session logic.
- The Rubenlagus AbilityBot Reply and ReplyFlow links demonstrate predicates and
  persisted conversation state, **not** a Java dependency to install in CE VAULT.
- Reply conditions must use actual update type and the existing persisted user/chat
  session; a template display state is not the source of transaction truth.
- Render MSG-01 when OCR starts, MSG-03 on unreadable slips, MSG-05 only on
  verified pinned-bank mismatch, and MSG-29 when processing fails.
- Existing `liveSettled` callers include *incoming THB records with calculated
  USDT owed*. Therefore the UI prints **RECORDED** rather than falsely claiming
  final reconciled settlement (MSG-11). Implement MSG-11 only when the existing
  database definitively confirms SENT == EXPECTED.
- Templates for unsupported states (duplicates, limits, override, exception and
  recovery) are reference-only until the existing business state and authorized
  callback handling are verified. Never display inert financial buttons.
- Preview amounts, masked accounts, dates and staff names are examples; never use
  them as live records.
- Telegram reply HTML uses supported tags and escapes live bank/name/ID values.

## Optional .WEBM animation

Telegram uses `sendSticker` for **video stickers encoded as .WEBM/VP9**,
rather than `sendAnimation` or a normal HTTP video URL. Upload the sticker
to Telegram, retrieve its `file_id`, and set the *server-side* secret/variable
`WEBM_SUCCESS_FILE_ID`. Optional phases:
`WEBM_PROCESSING_FILE_ID`, `WEBM_OCR_DONE_FILE_ID`,
`WEBM_WAITING_FILE_ID`, `WEBM_ERROR_FILE_ID`.

The provided reference animation is `CE-VAULT-success.webm`. Requirements:
512px on one side, max 3 seconds, max 30fps, no audio, VP9, <=256KB.
Motion is strictly presentational, optional and fire-and-forget. A missing or
invalid file ID must not interfere with text reply or ledger persistence.
There is intentionally no bot token in this repository or generated artifact.

## Validation

Run `npm run typecheck && npm run lint && npm test && npm run build`.
Test no duplicate replies, callback authorization and message formatting.
Check the actual deployed webhook transport before releasing; don't use
long-polling and production webhook for the same Telegram bot concurrently.
