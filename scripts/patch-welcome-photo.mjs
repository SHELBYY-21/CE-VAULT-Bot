import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const serverPath = path.join(root, 'appsrc', 'server', 'index.mjs');
const telegramPath = path.join(root, 'appsrc', 'server', 'repositories', 'telegram.mjs');
const assetDir = path.join(root, 'appsrc', 'server', 'brand');
const assetPath = path.join(assetDir, 'welcome.jpg');

function replaceOnce(source, needle, replacement, code) {
  if (!source.includes(needle)) throw new Error(code);
  return source.replace(needle, replacement);
}

// 1. Banner asset: public brand image, no secrets.
mkdirSync(assetDir, { recursive: true });
copyFileSync(path.join(root, 'runtime-patches', 'welcome.jpg'), assetPath);
const banner = readFileSync(assetPath);
if (banner.length < 20000 || banner[0] !== 0xff || banner[1] !== 0xd8) {
  throw new Error('WELCOME_BANNER_INVALID_JPEG');
}

// 2. Public read-only route, registered before the API 404 catch-all.
let server = readFileSync(serverPath, 'utf8');
const api404Anchor = 'app.all("/api/{*path}", (req, res) => problem(res, req, 404, "API_ROUTE_NOT_FOUND", "No API resource matches this route."));';
const brandRoute = [
  '// Public brand banner: read-only static asset, no secrets.',
  'app.get("/brand/welcome.jpg", (req, res) => {',
  '  res.set("Cache-Control", "public, max-age=3600").sendFile(path.join(ROOT, "server", "brand", "welcome.jpg"));',
  '});',
  '',
].join('\n');
server = replaceOnce(server, api404Anchor, brandRoute + api404Anchor, 'WELCOME_PHOTO_ROUTE_ANCHOR_NOT_FOUND');
writeFileSync(serverPath, server);

// 3. Telegram client: photo + caption + keyboard.
let telegram = readFileSync(telegramPath, 'utf8');
const tgAnchor = '    sendMessageWithMarkup(chatId, text, replyMarkup) {';
const photoMethod = [
  '    async sendPhotoWithMarkup(chatId, photo, caption, replyMarkup) {',
  '      return telegramRequest(token, "sendPhoto", { chat_id: chatId, photo, caption, reply_markup: replyMarkup });',
  '    },',
  '',
].join('\n');
telegram = replaceOnce(telegram, tgAnchor, photoMethod + tgAnchor, 'WELCOME_PHOTO_TELEGRAM_ANCHOR_NOT_FOUND');
writeFileSync(telegramPath, telegram);

console.log('[CE WELCOME PHOTO] banner asset, /brand/welcome.jpg route and sendPhotoWithMarkup installed.');
