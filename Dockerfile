FROM ghcr.io/ggml-org/llama.cpp:server

ENV PORT=8080

EXPOSE 8080

ENTRYPOINT ["/app/llama-server"]
CMD ["-hf", "LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4:Q4_K_M", "--host", "0.0.0.0", "--port", "8080", "-c", "1024", "-np", "1", "--temp", "0"]
