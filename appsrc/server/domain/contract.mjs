export const CANONICAL_STATES = Object.freeze([
  "IDLE",
  "SCANNING",
  "OCR_EXTRACTING",
  "VERIFYING",
  "NEED_CONFIRMATION",
  "PROCESSING",
  "WAITING",
  "SETTLING",
  "COMPLETED",
  "FAILED",
  "DUPLICATE",
  "TIMEOUT",
]);

export const FLOW_STAGES = Object.freeze([
  "SCAN",
  "OCR",
  "VERIFY",
  "CONFIRM",
  "PROCESS",
  "SETTLEMENT",
  "DONE",
]);

export const TERMINAL_STATES = Object.freeze([
  "COMPLETED",
  "FAILED",
  "DUPLICATE",
  "TIMEOUT",
]);

export const TRANSITIONS = Object.freeze({
  IDLE: ["SCANNING"],
  SCANNING: ["OCR_EXTRACTING", "FAILED", "TIMEOUT"],
  OCR_EXTRACTING: ["VERIFYING", "FAILED", "DUPLICATE"],
  VERIFYING: ["NEED_CONFIRMATION", "FAILED", "DUPLICATE"],
  NEED_CONFIRMATION: ["PROCESSING", "TIMEOUT"],
  PROCESSING: ["WAITING", "SETTLING", "FAILED", "TIMEOUT"],
  WAITING: ["PROCESSING", "SETTLING", "FAILED", "TIMEOUT"],
  SETTLING: ["COMPLETED", "FAILED", "TIMEOUT"],
  COMPLETED: [],
  FAILED: [],
  DUPLICATE: [],
  TIMEOUT: [],
});

export const TELEGRAM_ACTIONS = Object.freeze({
  REFRESH: "REFRESH",
  DETAILS: "DETAILS",
  CONFIRM_PROCESS: "CONFIRM_PROCESS",
  RECHECK: "RECHECK",
  AUDIT: "AUDIT",
});

export const CALLBACK_ACTIONS = Object.freeze(Object.keys(TELEGRAM_ACTIONS));

export function isCanonicalState(value) {
  return CANONICAL_STATES.includes(value);
}

export function isTerminalState(value) {
  return TERMINAL_STATES.includes(value);
}

export function canTransition(fromState, toState) {
  return isCanonicalState(fromState) && isCanonicalState(toState) && TRANSITIONS[fromState].includes(toState);
}

export function commandTarget(action, currentState) {
  if (action === TELEGRAM_ACTIONS.CONFIRM_PROCESS && currentState === "NEED_CONFIRMATION") {
    return "PROCESSING";
  }
  return null;
}

export function assertSandboxFlags(env) {
  if (env.CE_VAULT_SANDBOX !== "true") throw new Error("SANDBOX_MODE_REQUIRED");
  if (env.LIVE_SETTLEMENT !== "false" || env.LIVE_SETTLEMENT_ENABLED !== "false") {
    throw new Error("LIVE_SETTLEMENT_MUST_BE_FALSE");
  }
}
