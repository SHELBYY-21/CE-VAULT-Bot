# CE VAULT · Thai Slip OCR V4

Updated: 2026-10-08

## Decision

CE VAULT must not choose OCR by release number alone. The current Thai-first stack is:

1. **PaddleOCR-VL-1.6** as the preferred document parser when `PADDLEOCR_VL_URL` or `PADDLEOCR_BASE_URL` is configured.
2. **XAI vision** as semantic vision fallback.
3. **OCR.space** as last-resort amount extraction.
4. For self-hosted Thai recognition, prefer **`th_PP-OCRv5_mobile_rec`** as a dedicated Thai+English+numbers second-pass model.

Do **not** promote PP-OCRv6 to Thai primary merely because it is newer. The published PP-OCRv6 language list does not include Thai, while PaddleOCR-VL explicitly supports Thai among 109 languages and the dedicated PP-OCRv5 Thai recognizer is trained for Thai/English/numbers.

## Why PaddleOCR-VL-1.6

PaddleOCR-VL-1.6 was released 2026-05-28 and is designed for robust document parsing. It supports Thai and difficult real-world document conditions such as skew, warping, screen photography and complex illumination through the PaddleOCR-VL / PP-DocLayout pipeline.

The CE adapter uses the documented `POST /layout-parsing` contract with:

- document orientation classification
- document unwarping
- layout detection
- deterministic temperature 0
- no visualization payload
- bounded timeout

## Thai slip parsing rules

- Amount must be anchored to a payment/transfer label such as `จำนวนเงิน`, `ยอดชำระ`, `ยอดโอน`, `transaction amount`, `amount paid`, or `THB/บาท`.
- Never use account numbers, biller references, dates, times, fees or balances as the transfer amount.
- Bank names are normalized to CE bank codes.
- Account last4 may come from visibly masked account text only.
- Receiver/payee/biller name must be visibly supported.
- Missing fields remain `null`; no zero coercion and no invented values.
- Provider logs contain only provider/model/status metadata, never image bytes, OCR text, account numbers or names.

## Provider routing

```
PaddleOCR-VL-1.6
    ↓ if incomplete / low evidence
XAI vision
    ↓ if no amount
OCR.space
    ↓
manual review / OCR_FAILED
```

A provider result is scored by independently visible evidence. A low-evidence Paddle result does not automatically win merely because it is the preferred provider.

## Verification architecture

OCR is extraction, not payment verification.

Where a bank/partner API exposes slip verification, CE should treat API verification as a stronger source than OCR. Example: SCB documents a QR30 slip-verification endpoint using the transaction Slip ID. Thai QR Payment itself follows the national interoperable QR standard promoted by the Bank of Thailand.

## Research sources

- PaddleOCR releases: https://github.com/PaddlePaddle/PaddleOCR/releases
- PaddleOCR-VL docs: https://www.paddleocr.ai/latest/en/version3.x/pipeline_usage/PaddleOCR-VL.html
- PP-OCRv5 multilingual / Thai model docs: https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5_multi_languages.html
- PP-OCR pipeline language matrix: https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html
- Microsoft Document Intelligence Thai OCR: https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/language-support/ocr
- Google Cloud Vision OCR languages: https://docs.cloud.google.com/vision/docs/languages
- SCB slip verification: https://developer.scb/assets/documents/api-reference-index/qr-payments/get-billpayment-transactions.html
- Bank of Thailand PromptPay / Thai QR Payment: https://www.bot.or.th/en/financial-innovation/digital-finance/digital-payment/promptpay.html

## Deployment

The Paddle provider is optional and fail-safe. Without a configured endpoint, CE continues using XAI vision and OCR.space.

Required activation variables:

```
PADDLEOCR_VL_URL=<compatible PaddleOCR-VL /layout-parsing service>
# or
PADDLEOCR_BASE_URL=<service base URL>

# optional when the service requires bearer auth
PADDLEOCR_ACCESS_TOKEN=<secret>
```

Do not store these credentials in GitHub source, PR comments, test fixtures or Telegram messages.
