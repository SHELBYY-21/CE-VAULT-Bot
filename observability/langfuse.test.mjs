import test from "node:test";
import assert from "node:assert/strict";
import { isLangfuseAllowed, initializeLangfuseTelemetry, maskCeTrace } from "./langfuse.mjs";
const ENV = {
  CE_LANGFUSE_TRACING_ENABLED: "true", CE_LANGFUSE_ENV: "staging",
  NODE_ENV: "development", LANGFUSE_PUBLIC_KEY: "pk-test",
  LANGFUSE_SECRET_KEY: "sk-test", LANGFUSE_BASE_URL: "https://cloud.langfuse.com"
};
test("disabled by default; task still executes", async () => {
  const tracer = await initializeLangfuseTelemetry({});
  let count=0; assert.equal(tracer.enabled,false);
  assert.equal(await tracer.run("dispatch-outbox", async () => ++count),1);
  assert.equal(count,1);
});
test("never enable in production or without keys", () => {
  assert.equal(isLangfuseAllowed({...ENV, NODE_ENV:"production"}),false);
  assert.equal(isLangfuseAllowed({...ENV, LANGFUSE_SECRET_KEY:""}),false);
  assert.equal(isLangfuseAllowed({...ENV, LANGFUSE_BASE_URL:"http://localhost:3000"}),false);
});
test("redact arbitrary inputs, PII, and tokens with a strict allowlist", () => {
  assert.equal(maskCeTrace({data:"an account 1234567890"}),"[REDACTED]");
  assert.deepEqual(JSON.parse(maskCeTrace({data:JSON.stringify({
    workflow:"dispatch-outbox",result:"ok",environment:"staging",
    bankAccount:"1234567890",email:"secret@example.com",token:"Bearer SECRET",amount:10000
  })})),{workflow:"dispatch-outbox",result:"ok",environment:"staging"});
});
test("emits safe names and statuses only; preserves task return", async () => {
  let observed=[];let sdkStarts=0,sdkStops=0;
  class NodeSDK {async start(){sdkStarts++} async shutdown(){sdkStops++}}
  class LangfuseSpanProcessor { constructor(options){assert.equal(typeof options.mask,"function");} }
  const startActiveObservation=async (name,fn,opts)=>{
    const updates=[]; const val=await fn({update:(x)=>updates.push(x)});
    observed.push({name,updates,opts});return val;
  };
  const tracer=await initializeLangfuseTelemetry(ENV,async()=>[
    {NodeSDK},{LangfuseSpanProcessor},{startActiveObservation}
  ]);
  assert.equal(tracer.enabled,true);
  assert.equal((await tracer.run("dispatch-outbox",async()=>({account:"DO_NOT_LOG"}))).account,"DO_NOT_LOG");
  assert.deepEqual(observed,[{
    name:"dispatch-outbox",opts:{asType:"span"},
    updates:[{input:{workflow:"dispatch-outbox"},metadata:{environment:"staging"}},{output:{result:"ok"}}]
  }]);
  await tracer.shutdown();assert.equal(sdkStarts,1);assert.equal(sdkStops,1);
});
test("task errors propagate exactly once", async () => {
  let count=0;
  class NodeSDK{ start(){} shutdown(){} } class LangfuseSpanProcessor{}
  const fake=(name,fn)=>fn({update(){}});
  const tracer=await initializeLangfuseTelemetry(ENV,async()=>[
    {NodeSDK},{LangfuseSpanProcessor},{startActiveObservation:fake}
  ]);
  await assert.rejects(tracer.run("dispatch-outbox",async()=>{count++;throw new Error("real task failure")}),/real task failure/);
  assert.equal(count,1);
});
