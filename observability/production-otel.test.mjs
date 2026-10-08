import test from "node:test";
import assert from "node:assert/strict";
import { createCeProductionTracer, isCeProductionTracingAllowed } from "./production-otel.mjs";
const env = {
  NODE_ENV: "production",
  CE_LANGFUSE_TRACING_ENABLED: "true",
  CE_LANGFUSE_ENV: "production",
  LANGFUSE_BASE_URL: "https://cloud.langfuse.com",
  LANGFUSE_PUBLIC_KEY: "pk-lf-fake-unit-test",
  LANGFUSE_SECRET_KEY: "sk-lf-fake-unit-test",
};
const rand = bytes => Buffer.alloc(bytes, 7);

test("disabled by default and fails closed for staging/unapproved hosts", () => {
  assert.equal(isCeProductionTracingAllowed({}), false);
  assert.equal(isCeProductionTracingAllowed({...env, CE_LANGFUSE_TRACING_ENABLED: "false"}), false);
  assert.equal(isCeProductionTracingAllowed({...env, CE_LANGFUSE_ENV: "staging"}), false);
  assert.equal(isCeProductionTracingAllowed({...env, LANGFUSE_BASE_URL: "https://other.example"}), false);
  assert.equal(isCeProductionTracingAllowed({...env, NODE_ENV: "development"}), false);
});
test("opt-in sends static enums only, never leaks sensitive input, and never blocks", () => {
  const sends = [];
  const tracer = createCeProductionTracer({env,random:rand,now:()=>2000000000000,
    send:(url,opt)=>{sends.push({url,opt});return Promise.resolve({ok:true});}});
  assert.equal(tracer.enabled, true);
  assert.equal(tracer.record("dispatch-ce-outbox","ok"),true);
  assert.equal(sends.length,1);
  assert.equal(sends[0].url,"https://cloud.langfuse.com/api/public/otel/v1/traces");
  assert.ok(sends[0].opt.headers.authorization.startsWith("Basic "));
  const payload=JSON.parse(sends[0].opt.body);
  const obs=payload.resourceSpans[0].scopeSpans[0].spans[0];
  assert.equal(obs.name,"dispatch-ce-outbox");
  const serial=JSON.stringify(payload);
  for (const forbidden of ["sk-lf-","pk-lf-","bankAccount","customer","telegram","BOT_TOKEN","amount","message"]) {
    assert.equal(serial.includes(forbidden),false,forbidden);
  }
  assert.deepEqual(obs.attributes.map(x=>x.key),["langfuse.environment","langfuse.observation.input","langfuse.observation.output"]);
});
test("bounded rate one event per operation every five minutes", () => {
  let ms=2000000000000, count=0;
  const tracer=createCeProductionTracer({env,now:()=>ms,random:rand,send:()=>{count++;return Promise.resolve({ok:true});}});
  assert.equal(tracer.record("start-ce-runtime","ok"),true);
  assert.equal(tracer.record("start-ce-runtime","error"),false);
  ms+=300000;
  assert.equal(tracer.record("start-ce-runtime","ok"),true);
  assert.equal(count,2);
});
test("arbitrary observation or state values never sent", () => {
  let calls=0;
  const tracer=createCeProductionTracer({env,random:rand,send:()=>{calls++;return Promise.resolve();}});
  assert.equal(tracer.record("client-123456","ok"),false);
  assert.equal(tracer.record("dispatch-ce-outbox","money-payload"),false);
  assert.equal(calls,0);
});
test("network failures and synchronous transport errors do not affect caller", async () => {
  const t1=createCeProductionTracer({env,random:rand,send:()=>{throw Error("offline");}});
  const t2=createCeProductionTracer({env,random:rand,send:()=>Promise.reject(Error("offline"))});
  assert.doesNotThrow(()=>t1.record("start-ce-runtime","ok"));
  assert.doesNotThrow(()=>t2.record("start-ce-runtime","ok"));
  await new Promise(resolve=>setImmediate(resolve));
});
