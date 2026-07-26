# Slip authenticity — Forged / Edited / Duplicate

Every OCR slip card shows:

```
Forged     No
Edited     No
Duplicate  No
```

**No** = pass / clean. **Yes** = risk flag.

## Sources

| Flag | Source |
| --- | --- |
| Forged | Grok Vision (`forged`) — fake / not a real bank slip |
| Edited | Grok Vision (`edited`) — digitally altered amounts/overlays |
| Duplicate | Vision hint **or** Firestore `slip_fingerprints` match on amount+date+time+bank+last4 |

## Hot path

1. `analyzeSlip` → Vision flags (default all `false` / No)
2. `slipFingerprint` + `findDuplicateSlip`
3. `mergeAuthenticity` → card lines
4. If any **Yes** → `slipAuthRejected` (no auto-commit; manual `+amount` override allowed)
5. On successful incoming / deal → `rememberSlipFingerprint` + `ocr_runs` authenticity fields

## Code

| Path | Role |
| --- | --- |
| `src/lib/slipAuth.ts` | Labels, fingerprint, DB check/remember |
| `src/lib/grokVision.ts` | Prompt + parse authenticity booleans |
| `src/lib/botUi.ts` | Card lines via `authenticityBlock` |
| `app/api/telegram/webhook/route.ts` | Wire + block dirty slips |
