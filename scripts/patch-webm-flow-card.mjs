import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');
const telegramPath = path.join(root, 'appsrc', 'server', 'repositories', 'telegram.mjs');
const assetDir = path.join(root, 'appsrc', 'server', 'brand');
const assetPath = path.join(assetDir, 'webflow.mp4');

function replaceOnce(source, needle, replacement, code) {
  if (!source.includes(needle)) throw new Error(code);
  return source.replace(needle, replacement);
}

// 1. WEB FLOW animation asset: public brand video, no secrets, no fake data.
mkdirSync(assetDir, { recursive: true });
copyFileSync(path.join(root, 'runtime-patches', 'webflow.mp4'), assetPath);
const asset = readFileSync(assetPath);
if (asset.length < 30000 || asset[4] !== 0x66 || asset[5] !== 0x74 || asset[6] !== 0x79 || asset[7] !== 0x70) {
  throw new Error('WEBM_FLOW_ASSET_INVALID_MP4');
}

// 2. Public read-only route, registered before the API 404 catch-all.
let server = readFileSync(serverPath, 'utf8');
const api404Anchor = 'app.all("/api/{*path}", (req, res) => problem(res, req, 404, "API_ROUTE_NOT_FOUND", "No API resource matches this route."));';
const webmRoute = [
  '// Public WEB FLOW animation: read-only static asset, no secrets.',
  'app.get("/brand/webflow.mp4", (req, res) => {',
  '  res.set("Cache-Control", "public, max-age=3600").sendFile(path.join(ROOT, "server", "brand", "webflow.mp4"));',
  '});',
  '',
].join('\n');
server = replaceOnce(server, api404Anchor, webmRoute + api404Anchor, 'WEBM_FLOW_ROUTE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);

// 3. Telegram client: animation + caption + keyboard.
let telegram = readFileSync(telegramPath, 'utf8');
const pinMethod = [
  '    async pinChatMessage(chatId, messageId) {',
  '      return telegramRequest(token, "pinChatMessage", { chat_id: chatId, message_id: messageId, disable_notification: true });',
  '    },',
  '',
].join('\n');
const tgAnchor = '    sendMessageWithMarkup(chatId, text, replyMarkup) {';
const animMethod = [
  '    async sendAnimationWithMarkup(chatId, animation, caption, replyMarkup) {',
  '      return telegramRequest(token, "sendAnimation", { chat_id: chatId, animation, caption, reply_markup: replyMarkup });',
  '    },',
  '',
].join('\n');
telegram = replaceOnce(telegram, tgAnchor, pinMethod + tgAnchor, 'WEBM_FLOW_PIN_TELEGRAM_ANCHOR_NOT_FOUND');
telegram = replaceOnce(telegram, tgAnchor, animMethod + tgAnchor, 'WEBM_FLOW_TELEGRAM_ANCHOR_NOT_FOUND');
writeFileSync(telegramPath, telegram);

console.log('[CE WEBM FLOW] MP4 animation asset, /brand/webflow.mp4 route and sendAnimationWithMarkup installed.');
