const API_ROOT = "https://api.telegram.org";

async function telegramRequest(token, method, body) {
  const response = await fetch(`${API_ROOT}/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.ok) {
    const error = new Error("TELEGRAM_API_UNAVAILABLE");
    error.code = "TELEGRAM_API_UNAVAILABLE";
    throw error;
  }
  return payload.result;
}

export function buildStatusCard(job) {
  const amount = job.amount === null || job.amount === undefined ? "masked" : "฿•••••.••";
  return [
    "CE VAULT / YOUNGBOSS LIVE",
    "SANDBOX — no live funds moved",
    "",
    `Job: ${job.public_ref}`,
    `State: ${job.state}`,
    `Worker: ${job.worker}`,
    `Amount: ${amount}`,
    `Version: ${job.state_version}`,
    "",
    "Database-backed status card. Refresh to re-read the authoritative record.",
  ].join("\n");
}

export function createTelegramClient(token) {
  if (!token) return null;
  return Object.freeze({
    getWebhookInfo() {
      return telegramRequest(token, "getWebhookInfo", {});
    },
    sendMessage(chatId, text) {
      return telegramRequest(token, "sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
    },
    editMessage(chatId, messageId, text, replyMarkup) {
      return telegramRequest(token, "editMessageText", {
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: replyMarkup,
        disable_web_page_preview: true,
      });
    },
    answerCallback(callbackQueryId, text) {
      return telegramRequest(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false });
    },
  });
}
