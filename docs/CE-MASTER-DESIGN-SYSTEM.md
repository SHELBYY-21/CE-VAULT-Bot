# CE EMPIRE / CE VAULT — Master Design System v1.0

## Source of truth
User supplied `ce-vault-design-system.html` (tokens, components, icon language), `ce-vault-replit-export.html` (9-component export specification), `ce-vault-messages.html` (30 sample Telegram messages) and seven original reference images. The HTML specimens are design references, **not** production ledger facts or functional transaction code. Existing `src/lib/ceReplyTheme.ts` already maps the MSG identifiers.

## Brand
- Primary name: CE EMPIRE; operational application: CE VAULT.
- Tagline: BUILD · GROW · EMPOWER.
- Mascot: silver/navy humanoid CE robot, metallic gold edges, cyan illuminated eyes, gold CE chest insignia and crown.
- Dashboard art direction: reserved premium fintech panel surfaces; keep decoration in the hero, not behind dense numeric tables.

## Foundation tokens
| Role | Value |
|---|---|
| Base | `#03070F` |
| Secondary | `#05090E` |
| Card | `#080E18` |
| Elevated | `#0C1520` |
| Primary Cyan | `#00D4FF` |
| Gold Accent | `#F0B429` |
| Success | `#00E676` |
| Error / Short | `#FF5252` |
| Warning / Ready | `#FFCA28` |
| Mismatch | `#FF6D35` |
| OCR Processing | `#B39DDB` |
| Primary Text | `#E4F4FC` |
| Border | `rgba(0,212,255,.14)` |

Typography: Space Grotesk for UI copy, Space Mono for totals, rates, transaction IDs and tabular values; fallback to system-ui/ui-monospace without blocking page load.

## Status vocabulary (presentation contract only)
`OCR` (extraction ongoing) → `REVIEW` (needs inspection) → `MISMATCH` when account evidence conflicts → `READY` when verified requirements are satisfied → `PENDING` when an actual transfer is awaiting reconciliation → `SETTLED` only on verified settlement. `SHORT`, `DUPLICATE`, `REJECTED`, `REVERSED` are distinct exception states. Never label OCR or a recorded ledger row SETTLED.

The current dashboard API exposes **legacy statuses** `ocr_success`, `waiting_admin`, `completed`. Keep these labels explicit; the ten-state design vocabulary is a future visual contract, not an implemented replacement engine.

## Component language
- KPI cards: subtle cyan border, small uppercase label and Space Mono primary number; currency visibly separate from value.
- Transaction flow: step numbers, state-specific colors, no fabricated stage counts.
- Transaction rows: ID, amount, timestamp, current status, with room scoping.
- Inline CTA/menu: maintain clear contrast and mobile touch targets.
- Rounded geometry 6/10/14/18px; use 16–22px only for large hero/panels.
- One focal mascot in the hero; avoid repeated animations in operational tables.
- Motion respects prefers-reduced-motion.

## Data and safe implementation
- Preserve existing Firebase/Firestore storage and `/api/dashboard/data` + `/api/market-rate` polling.
- Keep current calculations, rooms, transaction types, CSV export and auth as-is.
- Financial figures must come from actual API records, not the preview illustrations.
- Existing calculated `usdt_amount` in deposits is not proof of USDT actually sent: the Dashboard must describe it as an amount represented in the deposit ledger.
- UI-only rollout; source / API / transaction logic must not be changed.
- User-provided original photographs are design references; use repo-hosted approved art only when physically present in public assets.

## Deploy
GitHub PR + CI first; then Render Singapore Next.js Web Service. Do not mutate credentials or Telegram webhook as part of a visual rollout. Test /dashboard on both desktop and mobile after the Render deploy.
