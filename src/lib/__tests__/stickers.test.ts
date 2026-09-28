import { describe, expect, it } from 'vitest';

// WEBM file_ids อ่านจาก env ตอน import โมดูล — ตั้งค่าก่อนโหลดโมดูลที่ถูกทดสอบ
process.env.WEBM_WELCOME_FILE_ID = 'CAACAgQHI';
process.env.WEBM_QUEUE_FILE_ID = '  CAACAgQWORK  ';
process.env.WEBM_THANK_YOU_FILE_ID = 'not-a-telegram-file-id';

const { getWebmMotionSticker, MASCOT_WEBM_ASSETS, STICKER_STATE_MASCOT } =
  await import('../../config/stickers');

describe('sticker config — CE mascot motion layer', () => {
  it('resolves configured WEBM motion file_ids (trimmed)', () => {
    expect(getWebmMotionSticker('WELCOME')).toBe('CAACAgQHI');
    expect(getWebmMotionSticker('QUEUE')).toBe('CAACAgQWORK');
  });

  it('rejects values that are not Telegram file_ids', () => {
    expect(getWebmMotionSticker('THANK_YOU')).toBeUndefined();
    expect(getWebmMotionSticker('VIP')).toBeUndefined();
  });

  it('lists exactly the eight canonical mascot animations', () => {
    expect(Object.values(MASCOT_WEBM_ASSETS).sort()).toEqual([
      'assets/mascot/alert.webm',
      'assets/mascot/done.webm',
      'assets/mascot/hi.webm',
      'assets/mascot/idle.webm',
      'assets/mascot/scan.webm',
      'assets/mascot/success.webm',
      'assets/mascot/wait.webm',
      'assets/mascot/work.webm',
    ]);
  });

  it('maps every wired bot moment to a rendered mascot asset', () => {
    for (const motion of Object.values(STICKER_STATE_MASCOT)) {
      expect(MASCOT_WEBM_ASSETS[motion]).toMatch(/^assets\/mascot\/.+\.webm$/);
    }
  });

  it('never auto-sends the ambient idle loop', () => {
    expect(Object.values(STICKER_STATE_MASCOT)).not.toContain('IDLE');
  });
});
