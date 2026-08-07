import { sendSticker } from './telegram';
import { getSticker } from '@/config/stickers';

export async function sendStickerFor(chatId: number, key: string): Promise<void> {
  try {
    const id = getSticker(key as any);
    if (id) await sendSticker(chatId, id);
  } catch (e) {
    // swallow sticker errors — non-critical
    console.warn('sendStickerFor error', e instanceof Error ? e.message : e);
  }
}

export default { sendStickerFor };
