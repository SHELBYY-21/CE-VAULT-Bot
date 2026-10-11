import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import { runInNewContext } from "node:vm";

// Isolated contract test: exercises the actual handler injected at build time.
// No database, Telegram request, deployment, or production secret is used.
const patch = readFileSync(new URL("./patch-ops-board.mjs", import.meta.url), "utf8");
const startMark = "const opsRoute = String.raw`";
const endMark = "`;" + "\nserver = replaceOnce(server, jobsRouteAnchor, opsRoute";
const start = patch.indexOf(startMark);
const end = patch.indexOf(endMark, start);
assert.ok(start >= 0 && end > start, "Cannot locate operations API build-time route");
const opsTemplate = patch.slice(start + startMark.length, end);
const nextRoute = opsTemplate.indexOf("\n\napp.get(\"/api/v1/jobs\"");
assert.ok(nextRoute > 0, "Cannot isolate operations route from jobs route");
const handlerSource = opsTemplate.slice(0, nextRoute);

function makeHarness(storedToken) {
  let handler;
  let repositoryCalls = 0;
  const repository = Object.fromEntries(
    ["listOpsTransactions", "listOpsPendingSlips", "listOpsRates", "listOpsOpenCycles", "listOpsBankAccounts", "listOpsOpenExceptions"]
      .map((method) => [method, async () => { repositoryCalls += 1; return []; }]),
  );
  runInNewContext(handlerSource, {
    app: { get(path, routeHandler) { if (path === "/api/v1/ops/overview") handler = routeHandler; } },
    process: { env: { CE_OPS_READ_TOKEN: storedToken } },
    Buffer,
    timingSafeEqual,
    requireRepository() { repositoryCalls += 1; return true; },
    repository,
    buildOpsOverview() { return { mode: "READ_ONLY", banks: [] }; },
    repositoryError(_res, _req, error) { throw error; },
  }, { timeout: 1000 });
  assert.equal(typeof handler, "function", "Operations handler must be registered");
  return { handler, getRepositoryCalls: () => repositoryCalls };
}

async function requestOverview(storedToken, authorization) {
  const harness = makeHarness(storedToken);
  const response = {
    statusCode: 200,
    headers: {},
    body: undefined,
    set(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
  await harness.handler({
    get(name) { return name.toLowerCase() === "authorization" ? authorization : undefined; },
  }, response);
  return { response, repositoryCalls: harness.getRepositoryCalls() };
}

test("ops overview denies unconfigured server token before any DB read", async () => {
  const { response, repositoryCalls } = await requestOverview(undefined, "Bearer any");
  assert.equal(response.statusCode, 401);
  assert.deepEqual(JSON.parse(JSON.stringify(response.body)), { error: "unauthorized" });
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(repositoryCalls, 0);
});

test("ops overview denies absent Authorization header even if token configured", async () => {
  const { response, repositoryCalls } = await requestOverview("isolated-example", undefined);
  assert.equal(response.statusCode, 401);
  assert.equal(repositoryCalls, 0);
});

test("ops overview rejects invalid bearer token before accessing data", async () => {
  const { response, repositoryCalls } = await requestOverview("isolated-example", "Bearer wrong");
  assert.equal(response.statusCode, 403);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(repositoryCalls, 0);
});

test("ops overview permits matching bearer token without weakening sandbox gates", async () => {
  const { response, repositoryCalls } = await requestOverview("isolated-example", "Bearer isolated-example");
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["cache-control"], "no-store");
  assert.equal(response.body.data.mode, "READ_ONLY");
  assert.equal(repositoryCalls, 7);
});
