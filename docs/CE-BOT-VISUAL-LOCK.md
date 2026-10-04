# CE EMPIRE / CE VAULT Bot — Visual & Reply Lock v1.1

Visual source: user-supplied CE EMPIRE images (gold crown/CE logo, cyan circular halo, navy/metal robot, 5-step finance flow, Thai dashboard) and the local CE VAULT Design Lock v1.0 package.
Copy source: `ce-vault-messages.html` (MSG-01...MSG-30), **not the sample amounts or bank accounts**.

## UI identity
- Navy #03070F / #0C1520 as base; electric cyan #00D4FF, restrained metallic gold #F0B429.
- Positive/recorded green #00E676, exception red #FF5252, amber #FFCA28.
- CE crown logo + metallic-blue/gold robot are brand/mascot references, not financial states.
- Mobile first (390px), Thai label primary, English technical status secondary, numeric mono/tabular.
- Flow: OCR → MATCH → IN → WAIT → DONE. A recorded deposit ("IN") is *not* proof of "DONE"/settlement.
- SVG icons for web UI; do **not** embed arbitrary SVG or WebM in Telegram HTML. Telegram only supports its approved HTML tags.

## Reply rendering
- `src/lib/ceReplyTheme.ts` holds canonical status labels and escaped dynamic content.
- `src/lib/liveMessage.ts` keeps one editable Telegram message per transaction, plus callback buttons already implemented in the webhook. Never add inert CONFIRM/RECHECK/OVERRIDE buttons.
- The webhook continues to own database operations, session state and authorization. Presentation must never change arithmetic or persist example content.
- Send MSG-01 only while OCR is actually processing, MSG-05 only on an observed bank mismatch, MSG-29 on failure. MSG-02 requires OCR, bank match and limit check; MSG-11/14 require reconciled USDT equality.
- Callback source of truth: `app/api/telegram/webhook/route.ts`. Use Telegram state-machine concepts, not the Java AbilityBot implementation.

## WEBM video-sticker layer
- Telegram video-sticker format: WEBM, VP9, transparent alpha, no audio, 512px on longest side, max 3 seconds, max 256 KB and up to 30 FPS.
- Upload approved videos through Telegram sticker tooling; store returned `file_id` in server-only secrets named `WEBM_PROCESSING_FILE_ID`, `WEBM_OCR_DONE_FILE_ID`, `WEBM_WAITING_FILE_ID`, `WEBM_SUCCESS_FILE_ID`, `WEBM_ERROR_FILE_ID`.
- `getWebmMotionSticker` resolves configured valid file IDs. Existing static stickers are the fallback; the core text message must remain understandable with media disabled.
- Avoid unsolicited looping animations and duplicate success bursts. Never display a success animation before successful confirmation of the event.
- DevMotion edit preview: https://devmotion.app/editor/p/SgtYC-ijx2eWUWDoaKzQj (not a verified Telegram-ready WEBM export).

## Existing UI icon candidate refs (from Supericons)
Home: mingcute:home_1_line; Queue: phosphor:queue; Transfer: mingcute:transfer_line; Warning: ionicons:warning-outline; Reporting: lucide:bar-chart; Automation: lucide:workflow. Validate icons and accessibility labels before adding to the web bundle.

## Non-goals
No modifications to ledger calculations, permissions, webhook/long-poll transport, Firebase schema, settlement logic, new commands, OCR thresholds, or live deployment in this PR.
