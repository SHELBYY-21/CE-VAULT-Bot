---
name: addsticker
description: Add a rendered sticker to the CE VAULT Telegram sticker pack from a sticker file_id (using file_unique_id as the dedupe hash), auto-resolving the pack name/short_name and title, with validation and error handling. Use when publishing or appending WEBM stickers to the bot's pack, or when the user mentions addStickerToSet, createNewStickerSet, sticker packs, or sticker file_ids.
disable-model-invocation: true
---

# Add a sticker to the CE VAULT pack

Append a sticker to the bot's Telegram sticker set given a `file_id` and a `hash`
(the sticker's `file_unique_id`, used to avoid adding duplicates). Resolve the
pack's `short_name`/`title` automatically, create the pack if it does not exist,
then add the sticker and return the new sticker's id.

## Where this fits in the repo

- Bot API calls go through the `tg(method, payload)` helper in `src/lib/telegram.ts`
  (POSTs JSON to `https://api.telegram.org/bot${BOT_TOKEN}/<method>` and throws
  `Telegram <method>: <description>` when `ok` is false). Reuse it — do not
  hand-roll another fetch wrapper.
- Rendered WEBM stickers live in `assets/stickers/` (see `scripts/render-stickers.mjs`
  and `scripts/verify-stickers.mjs`). Video stickers use `format: 'video'`.
- Runtime `file_id`s are read per state in `src/config/stickers.ts` (`STICKER_IDS`).
  After publishing, record the returned `file_id`s into the `STICKER_*` env vars.

## Required configuration (env)

| Var | Purpose |
| --- | --- |
| `BOT_TOKEN` | Bot that owns the pack (used by `tg()`). |
| `STICKER_PACK_OWNER_ID` | Telegram `user_id` of the pack owner (required by create/add). |
| `STICKER_PACK_SHORT_NAME` | Pack `name`, e.g. `ce_vault_nova_by_CEboi88bot` (must end with `_by_<bot_username>`). |
| `STICKER_PACK_TITLE` | Human title used only when the pack is first created. |

## Workflow

1. **Receive input** — accept `{ file_id, hash }`. Validate both are non-empty
   strings; reject early otherwise. `hash` is the sticker's `file_unique_id`.
2. **Resolve pack details** — read `short_name`, `title`, and `owner_id` from env.
   Call `getStickerSet` to fetch the existing pack.
3. **Create pack if missing** — if `getStickerSet` fails because the pack does not
   exist, call `createNewStickerSet` with the first sticker, then return its id.
4. **Dedupe by hash** — if any sticker already in the set has a matching
   `file_unique_id`, skip the add and return that existing sticker's id.
5. **Add sticker** — call `addStickerToSet` with an `InputSticker`
   (`{ sticker: file_id, format: 'video', emoji_list: [...] }`).
6. **Handle errors** — surface Telegram's `description` (e.g. `STICKERSET_INVALID`,
   `STICKER_PNG_NOPNG`, `STICKERS_TOO_MUCH`) as a clear message.

## Output format

- Success: `Sticker added successfully to pack '<title>' with ID: <file_id>.`
- Failure: `Error adding sticker: <reason>.`

## Implementation template

```ts
// src/lib/stickers/addSticker.ts
import { tg } from '@/lib/telegram'; // export tg() from src/lib/telegram.ts if not already exported

type StickerSet = {
  name: string;
  title: string;
  stickers: { file_id: string; file_unique_id: string; emoji?: string }[];
};

export type AddStickerInput = { file_id: string; hash: string; emoji?: string };
export type AddStickerResult =
  | { ok: true; stickerId: string; pack: string; created: boolean; deduped: boolean }
  | { ok: false; error: string };

export async function addSticker({
  file_id,
  hash,
  emoji = '🟦',
}: AddStickerInput): Promise<AddStickerResult> {
  if (!file_id?.trim() || !hash?.trim()) {
    return { ok: false, error: 'file_id and hash are required' };
  }

  const name = process.env.STICKER_PACK_SHORT_NAME?.trim();
  const title = process.env.STICKER_PACK_TITLE?.trim() || 'CE VAULT';
  const userId = Number(process.env.STICKER_PACK_OWNER_ID);
  if (!name || !userId) {
    return { ok: false, error: 'STICKER_PACK_SHORT_NAME / STICKER_PACK_OWNER_ID not configured' };
  }

  const inputSticker = { sticker: file_id, format: 'video' as const, emoji_list: [emoji] };

  try {
    // 2. Resolve pack (create if missing)
    let set: StickerSet | null = null;
    try {
      set = await tg<StickerSet>('getStickerSet', { name });
    } catch {
      await tg('createNewStickerSet', {
        user_id: userId,
        name,
        title,
        stickers: [inputSticker],
        sticker_type: 'regular',
      });
      return { ok: true, stickerId: file_id, pack: title, created: true, deduped: false };
    }

    // 4. Dedupe by file_unique_id (the "hash")
    const existing = set.stickers.find((s) => s.file_unique_id === hash);
    if (existing) {
      return { ok: true, stickerId: existing.file_id, pack: set.title, created: false, deduped: true };
    }

    // 5. Add
    await tg('addStickerToSet', { user_id: userId, name, sticker: inputSticker });
    return { ok: true, stickerId: file_id, pack: set.title, created: false, deduped: false };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
```

Note: `tg()` posts JSON, so it works when the sticker is referenced by an existing
`file_id`. To upload a brand-new file instead, first `uploadStickerFile`
(multipart, like `sendDocument` in `src/lib/telegram.ts`) to obtain a `file_id`,
then pass that here.

## Examples

- Input: `{ "file_id": "CAACAgUABBBB", "hash": "AgADabc123" }`
  → `Sticker added successfully to pack 'CE VAULT' with ID: CAACAgUABBBB.`
- Input: `{ "file_id": "CAACAgUABBBB", "hash": "" }`
  → `Error adding sticker: file_id and hash are required.`
- Input: existing `hash` already in the pack
  → returns the existing sticker id with `deduped: true` (no duplicate added).

## Notes

- Always resolve/verify the pack with `getStickerSet` before adding; only fall back
  to `createNewStickerSet` when the pack genuinely does not exist.
- Publishing to a pack is publicly visible (tied to the bot username) — confirm the
  `short_name` before running against production.
- Log both success (returned id) and failure (Telegram `description`) for tracking.
- After publishing all states, copy the returned `file_id`s into the `STICKER_*`
  env vars consumed by `src/config/stickers.ts`.
