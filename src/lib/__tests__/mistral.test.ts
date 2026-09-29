import { describe, expect, it, vi } from 'vitest';
import { askMistral, validateMessages } from '../mistral';

describe('Mistral-only AI integration', () => {
  it('rejects malformed messages', () => {
    expect(() => validateMessages([])).toThrow();
    expect(() => validateMessages([{ role: 'user', content: '' }])).toThrow();
  });
  it('calls only the Mistral API with server key', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), { status: 200 }));
    const answer = await askMistral([{ role: 'user', content: 'ping' }], { apiKey: 'test-key', fetchImpl: fetchImpl as typeof fetch });
    expect(answer).toBe('pong');
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl.mock.calls[0]?.[0]).toBe('https://api.mistral.ai/v1/chat/completions');
  });
  it('fails closed when key is missing', async () => {
    await expect(askMistral([{ role: 'user', content: 'ping' }], { apiKey: '' })).rejects.toMatchObject({ code: 'NOT_CONFIGURED' });
  });
});
