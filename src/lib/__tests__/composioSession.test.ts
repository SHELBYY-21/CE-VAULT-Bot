import { describe, expect, it, vi } from 'vitest';
import {
  ComposioSessionError,
  createComposioSession,
  normalizeSessionInput,
  normalizeToolkits,
} from '../composioSession';

describe('normalizeToolkits', () => {
  it('parses CSV, trims and removes duplicates', () => {
    expect(normalizeToolkits(' github, gmail,github ')).toEqual(['github', 'gmail']);
  });

  it('rejects unsafe identifiers', () => {
    expect(() => normalizeToolkits(['github', 'bad toolkit'])).toThrow(ComposioSessionError);
  });
});

describe('normalizeSessionInput', () => {
  it('accepts a stable CE VAULT user id', () => {
    expect(normalizeSessionInput({ userId: 'telegram:6049267196' })).toEqual({
      userId: 'telegram:6049267196',
      toolkits: undefined,
    });
  });

  it('rejects an invalid user id', () => {
    expect(() => normalizeSessionInput({ userId: '../secret' })).toThrow(ComposioSessionError);
  });
});

describe('createComposioSession', () => {
  it('sends the bearer token only to the configured webhook', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () =>
        new Response(
          JSON.stringify({ sessionId: 'session_123', mcpUrl: 'https://mcp.example/session_123' }),
          { status: 201, headers: { 'content-type': 'application/json' } },
        ),
    );

    const result = await createComposioSession(
      { userId: 'dashboard:ce-vault', toolkits: ['github'] },
      {
        env: {
          CE_API_TOKEN: 'server-secret-token',
          CE_COMPOSIO_SESSION_WEBHOOK_URL: 'https://n8n.example/webhook/session',
        },
        fetchImpl: fetchImpl as typeof fetch,
      },
    );

    expect(result).toEqual({
      sessionId: 'session_123',
      mcpUrl: 'https://mcp.example/session_123',
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [, request] = fetchImpl.mock.calls[0]!;
    expect(request?.headers).toMatchObject({ authorization: 'Bearer server-secret-token' });
  });

  it('does not retry a failed POST that could create a duplicate session', async () => {
    const fetchImpl = vi.fn<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(
      async () => new Response('{}', { status: 503 }),
    );
    await expect(
      createComposioSession(
        { userId: 'dashboard:ce-vault' },
        {
          env: {
            CE_API_TOKEN: 'server-secret-token',
            CE_COMPOSIO_SESSION_WEBHOOK_URL: 'https://n8n.example/webhook/session',
          },
          fetchImpl: fetchImpl as typeof fetch,
        },
      ),
    ).rejects.toMatchObject({ code: 'UPSTREAM_ERROR', status: 503 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
