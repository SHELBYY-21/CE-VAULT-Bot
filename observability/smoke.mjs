#!/usr/bin/env node
// Safe Langfuse staging smoke: no Telegram messages, bank records, or money flows.
import { initializeLangfuseTelemetry } from "./langfuse.mjs";
const telemetry = await initializeLangfuseTelemetry(process.env);
if (!telemetry.enabled) {
  console.error("Langfuse tracing inactive. Configure staging-only CE_LANGFUSE_TRACING_ENABLED=true, CE_LANGFUSE_ENV=staging, credentials and HTTPS base URL.");
  process.exitCode = 2;
} else {
  try {
    await telemetry.run("agent-task", async () => ({ synthetic: true }));
    console.log("Synthetic Langfuse trace queued. Verify receipt and safe fields in your Langfuse Traces dashboard.");
  } finally {
    await telemetry.shutdown();
  }
}
