import fs from 'fs/promises';
import Tesseract from 'tesseract.js';

const provider = process.env.OCR_PROVIDER || 'auto'; // 'google' | 'tesseract' | 'auto'

export async function runOCR(imageBufferOrPath: Buffer | string): Promise<string> {
  if (provider === 'google' || provider === 'auto') {
    try {
      // Dynamic require so missing google-cloud/vision credentials doesn't crash app startup
      const { ImageAnnotatorClient } = require('@google-cloud/vision');
      const client = new ImageAnnotatorClient();
      const [result] = await client.textDetection(imageBufferOrPath);
      const detections = result.textAnnotations;
      if (detections && detections.length > 0) {
        return detections[0].description || '';
      }
    } catch (e: any) {
      if (provider === 'google') {
        console.error('Google Cloud Vision OCR failed:', e?.message || e);
        throw e;
      }
      console.warn('Google Cloud Vision unavailable, falling back to Tesseract.js');
    }
  }

  // Fallback to Tesseract.js
  try {
    const worker = await Tesseract.createWorker('tha+eng');
    const { data: { text } } = await worker.recognize(imageBufferOrPath);
    await worker.terminate();
    return text;
  } catch (err: any) {
    console.error('Tesseract OCR error:', err?.message || err);
    return '';
  }
}
