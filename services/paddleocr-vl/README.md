# CE VAULT · PaddleOCR-VL-1.6 Runtime

Production OCR service for CE VAULT Thai Slip OCR V4.

## Live runtime

- Model: `LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4:Q4_K_M`
- Server: `llama.cpp` OpenAI-compatible multimodal server
- API: `POST /v1/chat/completions`
- Health: `GET /health`
- Model info: `GET /v1/models`
- Port: `8080`

This Q4 multimodal runtime is the production-compatible deployment for the current Railway memory limit. The full PaddleX/PaddlePaddle service exceeded the available runtime memory during model startup.

## Provider chain

```
PaddleOCR-VL-1.6
  -> XAI Vision
  -> OCR.space
  -> Manual Review / OCR_FAILED
```

OCR is extraction only. It must never mark a transaction as settled.

## Build / run

```bash
docker build -t ce-paddleocr-vl:1.6-q4 .
docker run --rm -p 8080:8080 ce-paddleocr-vl:1.6-q4
```

CE VAULT uses `PADDLEOCR_LLAMA_URL` when configured and retains XAI/OCR.space fallbacks.

Do not store secrets in this directory.
