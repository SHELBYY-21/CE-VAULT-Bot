/**
 * CE VAULT live operational tracing to Langfuse OTLP.
 * Dependency-free, explicit opt-in, read-only; no payloads, PII, IDs or errors
 * leave the process. Uses bounded nonblocking HTTP with zero retries.
 */
import { randomBytes } from "node:crypto";

const EU_ENDPOINT = "https://cloud.langfuse.com";
const ALLOWED = new Set(["start-ce-runtime", "dispatch-ce-outbox"]);
const ALLOWED_RESULTS = new Set(["ok", "error"]);

export function isCeProductionTracingAllowed(env = {}) {
  return env.CE_LANGFUSE_TRACING_ENABLED === "true" &&
    env.CE_LANGFUSE_ENV === "production" &&
    env.NODE_ENV === "production" &&
    env.LANGFUSE_BASE_URL === EU_ENDPOINT &&
    typeof env.LANGFUSE_PUBLIC_KEY === "string" &&
    env.LANGFUSE_PUBLIC_KEY.startsWith("pk-lf-") &&
    typeof env.LANGFUSE_SECRET_KEY === "string" &&
    env.LANGFUSE_SECRET_KEY.startsWith("sk-lf-");
}

const str = string => ({ stringValue: string });

export function createCeProductionTracer({
  env = process.env,
  send = globalThis.fetch,
  now = () => Date.now(),
  random = randomBytes,
} = {}) {
  const enabled = isCeProductionTracingAllowed(env);
  const seen = new Map();
  let pending = 0;

  return Object.freeze({
    enabled,
    // Intentionally synchronous: never await telemetry in an operational path.
    record(name, result) {
      if (!enabled || !ALLOWED.has(name) || !ALLOWED_RESULTS.has(result) || pending >= 2) return false;
      const ts = now();
      if (ts - (seen.get(name) ?? -Infinity) < 300000) return false;
      seen.set(name, ts);

      const nano = BigInt(ts) * 1000000n;
      const body = JSON.stringify({
        resourceSpans: [{
          resource: { attributes: [{ key: "service.name", value: str("ce-vault-runtime") }] },
          scopeSpans: [{
            scope: { name: "ce-vault-safe-runtime" },
            spans: [{
              traceId: random(16).toString("hex"),
              spanId: random(8).toString("hex"),
              name,
              kind: 1,
              startTimeUnixNano: nano.toString(),
              endTimeUnixNano: (nano + 1000000n).toString(),
              attributes: [
                { key: "langfuse.environment", value: str("production") },
                { key: "langfuse.observation.input", value: str(JSON.stringify({ operation: name })) },
                { key: "langfuse.observation.output", value: str(JSON.stringify({ result })) },
              ],
            }],
          }],
        }],
      });
      const authorization = "Basic " + Buffer.from(env.LANGFUSE_PUBLIC_KEY + ":" + env.LANGFUSE_SECRET_KEY).toString("base64");
      pending++;
      try {
        Promise.resolve(send(EU_ENDPOINT + "/api/public/otel/v1/traces", {
          method: "POST",
          headers: {
            authorization,
            "content-type": "application/json",
            "x-langfuse-ingestion-version": "4",
          },
          body,
          signal: AbortSignal.timeout(2500),
        })).catch(() => {}).finally(() => { pending--; });
      } catch {
        pending--;
      }
      return true;
    },
  });
}
