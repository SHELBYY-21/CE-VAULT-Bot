import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const telegramPath = path.join(root, 'appsrc', 'server', 'repositories', 'telegram.mjs');

function replaceOnce(source, needle, replacement, code) {
  if (!source.includes(needle)) throw new Error(code);
  return source.replace(needle, replacement);
}

const NL = String.fromCharCode(10);

// Telegram 2026 (Bot API 10.1+): sendRichMessageDraft streams honest live scan status.
// Drafts are ephemeral ~30s previews; the persisted reply is still sent via sendRichMessage.
let telegram = readFileSync(telegramPath, 'utf8');
const tgAnchor = '    sendMessageWithMarkup(chatId, text, replyMarkup) {';
const draftMethod = [
  '    async sendRichMessageDraft(chatId, draftId, richMessage) {',
  '      return telegramRequest(token, "sendRichMessageDraft", { chat_id: chatId, draft_id: draftId, rich_message: richMessage });',
  '    },',
  '',
].join(NL);
telegram = replaceOnce(telegram, tgAnchor, draftMethod + tgAnchor, 'TELEGRAM_2026_DRAFT_ANCHOR_NOT_FOUND');
writeFileSync(telegramPath, telegram);

console.log('[CE TELEGRAM 2026] sendRichMessageDraft installed for streaming scan status.');
