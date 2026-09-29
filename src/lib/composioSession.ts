const DEFAULT_WEBHOOK_URL = 'https://razen8n.app.n8n.cloud/webhook/ce-composio-session';
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TOOLKITS = 50;

export interface CreateComposioSessionInput {
  userId: string;
  toolkits?: string[];
}

export interface ComposioSessionResult {
  sessionId: string;
  mcpUrl: string;
}

interface SessionClientOptions {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

export class ComposioSessionError extends Error {
  constructor(
    public readonly code:
      | 'INVALID_INPUT'
      | 'NOT_CONFIGURED'
      | 'UPSTREAM_TIMEOUT'
      | 'UPSTREAM_ERROR'
      | 'INVALID_RESPONSE',
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'ComposioSessionError';
  }
}

export function normalizeToolkits(value: unknown): string[] | undefined {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : value == null
        ? []
        : (() => {
            throw new ComposioSessionError(
              'INVALID_INPUT',
              'toolkits must be an array or CSV string',
            );
          })();

  const normalized = [...new Set(raw.map((item) => String(item).trim()).filter(Boolean))];
  if (normalized.length > MAX_TOOLKITS) {
    throw new ComposioSessionError('INVALID_INPUT', `toolkits cannot exceed ${MAX_TOOLKITS} items`);
  }
  if (normalized.some((item) => item.length > 80 || !/^[a-zA-Z0-9_-]+$/.test(item))) {
    throw new ComposioSessionError('INVALID_INPUT', 'toolkits contain an invalid identifier');
  }
  return normalized.length ? normalized : undefined;
}

export function normalizeSessionInput(input: unknown): CreateComposioSessionInput {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new ComposioSessionError('INVALID_INPUT', 'request body must be an object');
  }

  const record = input as Record<string, unknown>;
  const userId = typeof record.userId === 'string' ? record.userId.trim() : '';
  if (!userId || userId.length > 128 || !/^[a-zA-Z0-9_.:@-]+$/.test(userId)) {
    throw new ComposioSessionError('INVALID_INPUT', 'userId is invalid');
  }

  return { userId, toolkits: normalizeToolkits(record.toolkits) };
}

function positiveTimeout(value: string | undefined): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 1_000 && parsed <= 30_000
    ? Math.floor(parsed)
    : DEFAULT_TIMEOUT_MS;
}

export async function createComposioSession(
  input: CreateComposioSessionInput,
  options: SessionClientOptions = {},
): Promise<ComposioSessionResult> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const validated = normalizeSessionInput(input);
  const webhookUrl = env.CE_COMPOSIO_SESSION_WEBHOOK_URL?.trim() || DEFAULT_WEBHOOK_URL;
  const token = env.CE_COMPOSIO_SESSION_TOKEN?.trim() || env.CE_API_TOKEN?.trim();

  if (!token) {
    throw new ComposioSessionError(
      'NOT_CONFIGURED',
      'CE_COMPOSIO_SESSION_TOKEN or CE_API_TOKEN is not configured',
    );
  }

  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new ComposioSessionError('NOT_CONFIGURED', 'Composio session webhook URL is invalid');
  }
  if (url.protocol !== 'https:' && url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
    throw new ComposioSessionError('NOT_CONFIGURED', 'Composio session webhook must use HTTPS');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), positiveTimeout(env.CE_COMPOSIO_TIMEOUT_MS));

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(validated),
      cache: 'no-store',
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new ComposioSessionError(
        'UPSTREAM_ERROR',
        `Composio session service returned HTTP ${response.status}`,
        response.status,
      );
    }

    const payload: unknown = await response.json();
    const result = payload as Record<string, unknown>;
    const sessionId = typeof result?.sessionId === 'string' ? result.sessionId.trim() : '';
    const mcpUrl = typeof result?.mcpUrl === 'string' ? result.mcpUrl.trim() : '';
    if (!sessionId || !mcpUrl) {
      throw new ComposioSessionError('INVALID_RESPONSE', 'Composio session response is incomplete');
    }

    const parsedMcpUrl = new URL(mcpUrl);
    if (parsedMcpUrl.protocol !== 'https:') {
      throw new ComposioSessionError('INVALID_RESPONSE', 'Composio MCP URL must use HTTPS');
    }
    return { sessionId, mcpUrl: parsedMcpUrl.toString() };
  } catch (error) {
    if (error instanceof ComposioSessionError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new ComposioSessionError('UPSTREAM_TIMEOUT', 'Composio session request timed out');
    }
    throw new ComposioSessionError('UPSTREAM_ERROR', 'Composio session service is unavailable');
  } finally {
    clearTimeout(timeout);
  }
}
