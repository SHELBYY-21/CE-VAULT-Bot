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

function telegramFileMime(filePath) {
  const lower = String(filePath || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  return "image/jpeg";
}

export function createTelegramClient(token) {
  if (!token) return null;
  return Object.freeze({
    async sendPhotoWithMarkup(chatId, photo, caption, replyMarkup) {
      return telegramRequest(token, "sendPhoto", { chat_id: chatId, photo, caption, reply_markup: replyMarkup });
    },
    async pinChatMessage(chatId, messageId) {
      return telegramRequest(token, "pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });
    },
    async sendAnimationWithMarkup(chatId, animation, caption, replyMarkup) {
      return telegramRequest(token, "sendAnimation", { chat_id: chatId, animation, caption, reply_markup: replyMarkup });
    },
    async sendRichMessageDraft(chatId, draftId, richMessage) {
      return telegramRequest(token, "sendRichMessageDraft", { chat_id: chatId, draft_id: draftId, rich_message: richMessage });
    },
    sendMessageWithMarkup(chatId, text, replyMarkup) {
      return telegramRequest(token, "sendMessage", { chat_id: chatId, text, link_preview_options: { is_disabled: true }, reply_markup: replyMarkup });
    },
    async sendRichMessageWithFallback(chatId, richMessage, fallbackText, replyMarkup) {
      try {
        return await telegramRequest(token, "sendRichMessage", { chat_id: chatId, rich_message: richMessage, reply_markup: replyMarkup });
      } catch (error) {
        return telegramRequest(token, "sendMessage", { chat_id: chatId, text: fallbackText, link_preview_options: { is_disabled: true }, reply_markup: replyMarkup });
      }
    },
    async editRichMessageWithFallback(chatId, messageId, richMessage, fallbackText, replyMarkup) {
      try {
        return await telegramRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, rich_message: richMessage, reply_markup: replyMarkup });
      } catch (error) {
        return telegramRequest(token, "editMessageText", { chat_id: chatId, message_id: messageId, text: fallbackText, link_preview_options: { is_disabled: true }, reply_markup: replyMarkup });
      }
    },
    answerCallbackQuery(callbackQueryId, text) {
      return telegramRequest(token, "answerCallbackQuery", { callback_query_id: callbackQueryId, ...(text ? { text } : {}) });
    },
    async downloadFile(fileId) {
      const meta = await telegramRequest(token, "getFile", { file_id: fileId });
      if (!meta?.file_path) {
        const error = new Error("TELEGRAM_FILE_UNAVAILABLE");
        error.code = "TELEGRAM_FILE_UNAVAILABLE";
        throw error;
      }
      if (Number(meta.file_size || 0) > 8 * 1024 * 1024) {
        const error = new Error("TELEGRAM_FILE_TOO_LARGE");
        error.code = "TELEGRAM_FILE_TOO_LARGE";
        throw error;
      }
      const response = await fetch(`${API_ROOT}/file/bot${token}/${meta.file_path}`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        const error = new Error("TELEGRAM_FILE_UNAVAILABLE");
        error.code = "TELEGRAM_FILE_UNAVAILABLE";
        throw error;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      return { buffer, filePath: meta.file_path, mimeType: telegramFileMime(meta.file_path) };
    },
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
