FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PADDLE_PIPELINE=PaddleOCR-VL \
    PADDLE_DEVICE=cpu \
    PORT=8080

RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl libglib2.0-0 libgl1 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

RUN python -m pip install --upgrade pip setuptools wheel \
    && python -m pip install "paddlepaddle==3.2.1" -i https://www.paddlepaddle.org.cn/packages/stable/cpu/ \
    && python -m pip install "paddleocr[doc-parser]==3.6.0" \
    && paddlex --install serving

COPY services/paddleocr-vl/start.sh /usr/local/bin/start-paddleocr-vl
RUN chmod +x /usr/local/bin/start-paddleocr-vl

EXPOSE 8080
CMD ["/usr/local/bin/start-paddleocr-vl"]
