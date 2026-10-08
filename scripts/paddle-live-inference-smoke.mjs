import assert from 'node:assert/strict';

if (process.env.GITHUB_WORKFLOW !== 'Test') {
  console.log('paddle live inference smoke skipped outside Test workflow');
  process.exit(0);
}

const endpoint = 'https://ce-ocr-paddlevl16-production.up.railway.app/v1/chat/completions';
const model = 'LunarOilRig/PaddleOCR-VL-1.6-GGUF-Q4:Q4_K_M';
const image = 'iVBORw0KGgoAAAANSUhEUgAAAWgAAADcAQAAAAB1sgavAAADFUlEQVR42u3ZsWsbZxjH8e97OttHUOvD4FAIxAc1tJRQVMgQik2ODCFbMmQIgYL6H7ibDan12m1BU6Mtq8nQqXMJWXo2GTwkRIRACoXkBIIWUuyTIsrJvru3g+3EshW/r4a0NLw36eU+vPrdey/v8yAJxQiXg9VWW/2v606g06uHholmclUIpZSKZ5RqKfWHOvE6SLIGvIRiTZNE/HhouCt1uVOAWgzTMBUYr8kZyQeRVq/nS90fLs7X3Evd/oyn01EIYUzBr6RbO0ZJEhDIBKXTyzGUJGL7FqVOotMekKU4QO5ocwsgAOWDPx8YrmABlJvaFfwIKDyyBSiVtHqbFJ8MCclievIeVN/JOZKFD1n0s4XqJJo9GIIL/v4TCF2S6obn8bXrguf74ydpYSug1VZb/d5qbyT9p7FuhRCbRdk/xx8rk8sBaI7wlBudq/73qv5AGulnE2fv/cLPv5nN/ZP3VeUyV1wzHaOIWDbJXZLw2Y2tc7OnzzwMtdqFyquVm3+9NHo/Dkg347TZMr7ZVcpQK7gAFUN9Cp6kTBm8HVuLrbbaaqvfqe6+GdX1upy/Hp3TVQilkrmJgzr+SskT6/zgad8rj9Kf9PS5G0vnk/4nO7cvdeIJf0OnK7tVSg2CO3/D09+1SdwqboUvZwXCvyt1OgOgbdCMOdAbk/RDpphChVqdjEf0IyJ2EFKrT4nq3kL2TPbJNh4ggYhUq53ecoy8/zllSKo6HeQfXxvj+jRja732p/9lV9CTo2hvpLlzc217H6utttrqEXV///zOXRO9G/G6gcidli++dVq+WHLXg2Pl88h8IuvGjSLrxo0sbUdrQ+Ye2y/Xk5lJkomR6s5qpzb/TThz8Yv6ZuPo7fam9ygYyF178Ryak3jDkqgsSwbXO4r3/ogphn15kQ4muTUDkxJYGFbFktLiYG6AEKi97XeNYdXVfQf7JDr4vG6iC8iICpy9BkijM9js1Ns0m/1jt/PwWO4QBwQ4HGvwfO+oFlK4XmVVUA6kcjvBinI7wUrutcIVPN/2EFZbbbXVVlv9v9X/ABGNfmi0UWaaAAAAAElFTkSuQmCC';

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model,
    temperature: 0,
    max_tokens: 512,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Transcribe ALL visible text from this Thai payment receipt/slip. Preserve useful line breaks and original Thai/English/numbers. Do not summarize, calculate, translate, or invent missing values. Return plain text only.',
        },
        {
          type: 'image_url',
          image_url: { url: 'data:image/png;base64,' + image },
        },
      ],
    }],
  }),
  signal: AbortSignal.timeout(120_000),
});

assert.equal(response.ok, true, 'live Paddle endpoint must return HTTP 2xx');
const payload = await response.json();
const value = payload?.choices?.[0]?.message?.content;
const text = typeof value === 'string'
  ? value
  : Array.isArray(value)
    ? value.map((part) => typeof part === 'string' ? part : part?.text || '').join('\n')
    : '';

assert.ok(text.trim().length > 0, 'live Paddle inference must return extracted text');
const normalized = text.replace(/[\s,]/g, '');
assert.match(normalized, /12345(?:\.67)?/, 'live OCR should recover the synthetic THB amount');

console.log(JSON.stringify({
  live: true,
  model,
  recoveredAmount: true,
  outputChars: text.length,
}));
