/**
 * Langfuse v5 telemetry for CE VAULT. Deliberately staging-only and fail-open.
 * Exports only controlled operation names and result enums, never raw payloads.
 * Install isolated dependencies: npm install --prefix observability
 */
const OFF = Object.freeze({
  enabled: false,
  run: async (_operation, task) => task(),
  shutdown: async () => {},
});
export function isLangfuseAllowed(env = {}) {
  return env.CE_LANGFUSE_TRACING_ENABLED === "true" &&
    env.CE_LANGFUSE_ENV === "staging" &&
    env.NODE_ENV !== "production" &&
    Boolean(env.LANGFUSE_PUBLIC_KEY && env.LANGFUSE_SECRET_KEY) &&
    /^https:\/\/[a-z0-9.-]+(?::443)?\/?$/i.test(env.LANGFUSE_BASE_URL || "");
}
const OPERATIONS = new Set(["dispatch-outbox", "agent-task", "evaluate-agent"]);
const RESULTS = new Set(["ok", "error"]);
export function maskCeTrace({ data }) {
  // Fail closed: don't attempt to infer whether unstructured data is safe.
  if (typeof data !== "string") return "[REDACTED]";
  let candidate;
  try { candidate = JSON.parse(data); } catch { return "[REDACTED]"; }
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return "[REDACTED]";
  const safe = {};
  if (OPERATIONS.has(candidate.workflow)) safe.workflow = candidate.workflow;
  if (RESULTS.has(candidate.result)) safe.result = candidate.result;
  if (candidate.environment === "staging") safe.environment = "staging";
  return JSON.stringify(safe);
}
export async function initializeLangfuseTelemetry(env = process.env, getModules) {
  if (!isLangfuseAllowed(env)) return OFF;
  try {
    const modules = getModules ? await getModules() : await Promise.all([
      import("@opentelemetry/sdk-node"), import("@langfuse/otel"), import("@langfuse/tracing"),
    ]);
    const [{ NodeSDK }, { LangfuseSpanProcessor }, { startActiveObservation }] = modules;
    const processor = new LangfuseSpanProcessor({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      baseUrl: env.LANGFUSE_BASE_URL,
      // Do not export incidental Express, HTTP, Supabase, or external AI SDK spans.
      shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === "langfuse-sdk",
      mask: maskCeTrace,
    });
    const sdk = new NodeSDK({ spanProcessors: [processor] });
    await sdk.start();
    return {
      enabled: true,
      async run(operation, task) {
        if (!OPERATIONS.has(operation)) return task();
        let entered = false;
        try {
          return await startActiveObservation(operation, async (span) => {
            entered = true;
            try { span.update({ input: { workflow: operation }, metadata: { environment: "staging" } }); } catch {}
            try {
              const result = await task();
              try { span.update({ output: { result: "ok" } }); } catch {}
              return result;
            } catch (error) {
              try { span.update({ output: { result: "error" } }); } catch {}
              throw error;
            }
          }, { asType: operation === "agent-task" ? "agent" : "span" });
        } catch (error) {
          // Only retry execution if the tracing framework failed before task entry.
          if (!entered) return task();
          throw error;
        }
      },
      async shutdown() { try { await sdk.shutdown(); } catch {} },
    };
  } catch {
    // Telemetry must never block financial workflows or webhook delivery.
    return OFF;
  }
}
