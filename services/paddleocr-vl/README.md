# CE VAULT · PaddleOCR-VL-1.6-1.6 Runtime

Dedicated OCR service for CE VAULT Thai Slip OCR V4.

## Runtime

- PaddleOCR package: `3.6.0`
- PaddleOCR-VL-1.6 model family: `1.6`
- PaddlePaddle CPU runtime: `3.2.1`
- Serving: `paddlex --serve`
- API endpoint consumed by CE VAULT: `POST /layout-parsing`
- Default port: `8080`

## Provider chain

```
PaddleOCR-VL-1.6-1.6
  -> XAI Vision
  -> OCR.space
  -> Manual Review / OCR_FAILED
```

Paddle is presentation/extraction only. It must never mark a transaction as settled.

## Build

```bash
docker build -t ce-paddleocr-vl:1.6 .
```

## Run

```bash
docker run --rm -p 127.0.0.1:8080:8080 ce-paddleocr-vl:1.6
```

Then configure the CE VAULT bot with:

```
PADDLEOCR_BASE_URL=http://<host>:8080
```

Do not place secrets in this directory.
