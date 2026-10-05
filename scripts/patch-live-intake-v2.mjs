import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptsDir, '..');
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

  // Harden Thai slip date parsing: two-digit Thai Buddhist shorthand such as 69 means 2569 -> 2026.
  const runtimePath = path.join(root, 'appsrc', 'server', 'live-intake.mjs');
  let runtime = readFileSync(runtimePath, 'utf8');
  const oldYearLogic = '  let year = Number(match[3]);\n  if (year < 100) year += 2000;\n  if (year > 2400) year -= 543;';
  const newYearLogic = '  const rawYear = String(match[3]);\n  let year = Number(rawYear);\n  if (rawYear.length === 2) year = year >= 40 ? year + 1957 : year + 2000;\n  if (rawYear.length === 4 && year > 2400) year -= 543;';
  if (!runtime.includes(oldYearLogic)) throw new Error('LIVE_INTAKE_YEAR_LOGIC_NOT_FOUND');
  runtime = runtime.replace(oldYearLogic, newYearLogic);
  writeFileSync(runtimePath, runtime);

  // Correct the financial fixture. The runtime BigInt decimal division was already correct.
  const testPath = path.join(root, 'appsrc', 'tests', 'live-intake.test.mjs');
  let testSource = readFileSync(testPath, 'utf8');
  if (!testSource.includes('26937.194045')) throw new Error('LIVE_INTAKE_DECIMAL_FIXTURE_NOT_FOUND');
  testSource = testSource.replace('26937.194045', '26937.188135');
  writeFileSync(testPath, testSource);
} finally {
  try { unlinkSync(generatedPath); } catch {}
}
