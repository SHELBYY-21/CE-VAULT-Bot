const ENDPOINT = 'https://api.mistral.ai/v1/chat/completions';
const MODEL = 'mistral-small-latest';
const MAX_MESSAGES = 20;
const MAX_CONTENT = 8000;

export type MistralMessage = { role: 'system' | 'user' | 'assistant'; content: string };

export class MistralError extends Error {
  constructor(public readonly code: 'NOT_CONFIGURED' | 'INVALID_INPUT' | 'UPSTREAM_ERROR' | 'UPSTREAM_TIMEOUT' | 'INVALID_RESPONSE', public readonly status?: number) {
    super(code);
  }
}

export function validateMessages(input: unknown): MistralMessage[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_MESSAGES) throw new MistralError('INVALID_INPUT');
  const messages = input.map((item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new MistralError('INVALID_INPUT');
    const { role, content } = item as Record<string, unknown>;
    if (!['system', 'user', 'assistant'].includes(String(role)) || typeof content !== 'string' || !content.trim() || content.length > MAX_CONTENT) throw new MistralError('INVALID_INPUT');
    return { role, content: content.trim() } as MistralMessage;
  });
  if (!messages.some(m => m.role === 'user')) throw new MistralError('INVALID_INPUT');
  return messages;
}

export async function askMistral(messages: MistralMessage[], options: { apiKey?: string; fetchImpl?: typeof fetch } = {}): Promise<string> {
  const key = options.apiKey ?? process.env.MISTRAL_API_KEY;
  if (!key?.trim()) throw new MistralError('NOT_CONFIGURED');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await (options.fetchImpl ?? fetch)(ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, messages: validateMessages(messages), temperature: 0.2, max_tokens: 512 }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new MistralError('UPSTREAM_ERROR', response.status);
    const data: unknown = await response.json();
    const content = (data as { choices?: { message?: { content?: unknown } }[] })?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) throw new MistralError('INVALID_RESPONSE');
    return content.trim();
  } catch (error) {
    if (error instanceof MistralError) throw error;
    if (error instanceof Error && error.name === 'AbortError') throw new MistralError('UPSTREAM_TIMEOUT');
    throw new MistralError('UPSTREAM_ERROR');
  } finally {
    clearTimeout(timer);
  }
}
