import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../telegram', () => ({
  sendMessage: vi.fn(async () => 1),
  editMessage: vi.fn(async () => true),
  sendSticker: vi.fn(async () => undefined),
  sendDocument: vi.fn(async () => undefined),
  sendChatAction: vi.fn(async () => undefined),
  answerCallback: vi.fn(async () => undefined),
}));

import { editMessage, sendSticker } from '../telegram';
import { ceMessage } from '../ceReplyTheme';

// WEBM file_ids อ่านตอน import โมดูล — ตั้งค่าก่อนโหลด motionFx
process.env.WEBM_PROCESSING_FILE_ID = 'CAACAgQSCAN';
process.env.WEBM_OCR_DONE_FILE_ID = 'CAACAgQDONE';
process.env.WEBM_WAITING_FILE_ID = 'CAACAgQWAIT';
process.env.WEBM_SUCCESS_FILE_ID = 'CAACAgQWIN';
process.env.WEBM_ERROR_FILE_ID = 'CAACAgQALERT';
process.env.WEBM_RETRY_FILE_ID = 'CAACAgQRETRY';

const { motionMoment, motionGate, motionAfter } = await import('../motionFx');

const ocrFrame = ceMessage('MSG-01', '🔄 กำลังอ่านสลิป...\n⏳ OCR กำลังประมวลผล');
const editMock = vi.mocked(editMessage);
const stickerMock = vi.mocked(sendSticker);

describe('motionMoment — live frame → sticker moment', () => {
  it('maps every wired stage', () => {
    expect(motionMoment('<b>● Receiving...</b>')).toBe('PROCESSING');
    expect(motionMoment(ocrFrame)).toBe('PROCESSING');
    expect(motionMoment('<b>● OCR</b>')).toBe('PROCESSING');
    expect(motionMoment('<b>● Verified</b>')).toBe('OCR_DONE');
    expect(motionMoment('<b>● Waiting</b>')).toBe('WAITING');
    expect(motionMoment('◈ CE · RECORDED ✓\n✅ บันทึกเงินเข้าแล้ว')).toBe('SUCCESS');
    expect(motionMoment(ceMessage('MSG-29', '⚠️ ระบบขัดข้อง'))).toBe('ERROR');
    expect(motionMoment(ceMessage('MSG-03', 'อ่านสลิปไม่ได้'))).toBe('ERROR');
    expect(motionMoment(ceMessage('MSG-05', '❌ บัญชีไม่ตรงกัน'))).toBe('RETRY');
  });

  it('returns null for frames with no locked moment', () => {
    expect(motionMoment('สวัสดีครับ')).toBeNull();
    expect(motionMoment('')).toBeNull();
  });
});

describe('motionAfter — mascot sticker per moment', () => {
  it('sends the configured WEBM sticker once per (message, moment)', () => {
    motionAfter(101, 201, { text: '<b>● Verified</b>' });
    expect(stickerMock).toHaveBeenCalledWith(101, 'CAACAgQDONE');
    motionAfter(101, 201, { text: '<b>● Verified</b>' });
    expect(stickerMock).toHaveBeenCalledTimes(1);
    motionAfter(101, 201, { text: '<b>● Waiting</b>' });
    expect(stickerMock).toHaveBeenLastCalledWith(101, 'CAACAgQWAIT');
  });

  it('ignores unknown frames', () => {
    const before = stickerMock.mock.calls.length;
    motionAfter(101, 299, { text: 'plain text' });
    expect(stickerMock.mock.calls.length).toBe(before);
  });

  it('CE_MOTION_FX=0 disables all motion', () => {
    process.env.CE_MOTION_FX = '0';
    try {
      const before = stickerMock.mock.calls.length;
      motionAfter(101, 301, { text: '<b>● Verified</b>' });
      motionAfter(101, 302, { text: ocrFrame });
      expect(stickerMock.mock.calls.length).toBe(before);
    } finally {
      delete process.env.CE_MOTION_FX;
    }
  });
});

describe('OCR progress effect', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('animates the MSG-01 frame in two staged edits', async () => {
    editMock.mockClear();
    motionAfter(102, 401, { text: ocrFrame });
    expect(editMock).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(700);
    expect(editMock).toHaveBeenCalledTimes(1);
    expect(editMock.mock.calls[0][2].text).toContain('◐ กำลังสแกนสลิป');
    expect(editMock.mock.calls[0][2].text).toContain('🔄 กำลังอ่านสลิป');
    await vi.advanceTimersByTimeAsync(700);
    expect(editMock).toHaveBeenCalledTimes(2);
    expect(editMock.mock.calls[1][2].text).toContain('◓ ตรวจจับยอดตัวเลข');
    expect(editMock.mock.calls[1][2].text).not.toContain('⏳ OCR กำลังประมวลผล');
  });

  it('runs only one effect per live message', async () => {
    editMock.mockClear();
    motionAfter(103, 402, { text: ocrFrame });
    motionAfter(103, 402, { text: ocrFrame });
    await vi.advanceTimersByTimeAsync(700);
    expect(editMock).toHaveBeenCalledTimes(1);
  });

  it('stops when the next stage arrives (motionGate cancels first)', async () => {
    editMock.mockClear();
    motionAfter(104, 403, { text: ocrFrame });
    motionGate(403, { text: '<b>● Verified</b>' });
    await vi.advanceTimersByTimeAsync(2000);
    expect(editMock.mock.calls.filter((c) => c[1] === 403)).toHaveLength(0);
  });

  it('keeps running when the incoming frame is the same OCR frame', async () => {
    editMock.mockClear();
    motionAfter(105, 404, { text: ocrFrame });
    motionGate(404, { text: ocrFrame });
    await vi.advanceTimersByTimeAsync(700);
    expect(editMock.mock.calls.filter((c) => c[1] === 404)).toHaveLength(1);
  });
});
