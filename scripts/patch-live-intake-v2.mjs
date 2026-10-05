import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const sourcePath = path.join(scriptsDir, 'patch-live-intake.mjs');
const generatedPath = path.join(scriptsDir, '.patch-live-intake.generated.mjs');
let source = readFileSync(sourcePath, 'utf8');

const startMarker = 'const intakeHelpers = String.raw`';
const tailMarker = "\nserver = replaceOnce(server, '\\nasync function processTelegramUpdate(update) {'";
const start = source.indexOf(startMarker);
const tail = source.indexOf(tailMarker, start);
if (start < 0 || tail < 0) throw new Error('LIVE_INTAKE_V2_TEMPLATE_BOUNDARY_NOT_FOUND');

source = source.slice(0, start)
  + "const intakeHelpers = readFileSync(path.join(root, 'runtime-patches', 'server-intake-helpers.txt'), 'utf8');\n"
  + source.slice(tail + 1);

writeFileSync(generatedPath, source);
try {
  await import(`${pathToFileURL(generatedPath).href}?v=${Date.now()}`);
} finally {
  try { unlinkSync(generatedPath); } catch {}
}
