// CE SLIP VERIFY - QR decode layer for Thai bank slip photos.
// Verification provider logic lives in live-intake.mjs (single source).
// Vendored decoders: jsQR (MIT) + jpeg-js (BSD-3), see vendor/ATTRIBUTION.md.
import { createRequire } from 'node:module';

const nodeRequire = createRequire(import.meta.url);
let jpegDecoder = null;
let qrDecoder = null;
let vendorLoaded = false;

function loadVendors() {
  if (vendorLoaded) return Boolean(jpegDecoder && qrDecoder);
  vendorLoaded = true;
  try {
    jpegDecoder = nodeRequire('./vendor/jpeg-js/index.cjs');
    qrDecoder = nodeRequire('./vendor/jsQR.cjs');
  } catch {
    jpegDecoder = null;
    qrDecoder = null;
  }
  return Boolean(jpegDecoder && qrDecoder);
}

// Returns the raw EMVCo/PromptPay payload string decoded from a slip photo, or null.
export function decodeSlipQrPayload(buffer) {
  if (!loadVendors() || !buffer?.length) return null;
  try {
    const image = jpegDecoder.decode(buffer, { useTArray: true, maxMemoryUsageInMB: 512 });
    const code = qrDecoder(image.data, image.width, image.height);
    const data = code?.data ? String(code.data).trim() : '';
    return /^0002/.test(data) ? data : null;
  } catch {
    return null;
  }
}
