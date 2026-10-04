import 'server-only';
import { Buffer } from 'node:buffer';
import { createClient } from '@supabase/supabase-js';

const GATEWAY_FORWARD_HEADERS = [
  'accept',
  'accept-profile',
  'content-profile',
  'content-type',
  'prefer',
  'range',
  'if-match',
  'if-none-match',
  'cache-control',
  'x-client-info',
  'x-upsert',
] as const;

function createGatewayFetch(options: {
  supabaseUrl: string;
  gatewayUrl: string;
  gatewayAuth: string;
  anonKey: string;
}): typeof fetch {
  const supabaseOrigin = new URL(options.supabaseUrl).origin;

  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const target = new URL(request.url);

    if (target.origin !== supabaseOrigin) {
      throw new Error('Supabase gateway refused unexpected upstream origin');
    }
    if (!target.pathname.startsWith('/rest/v1/') && !target.pathname.startsWith('/storage/v1/object/')) {
      throw new Error('Supabase gateway refused unsupported upstream path');
    }

    const forwardedHeaders: Record<string, string> = {};
    for (const key of GATEWAY_FORWARD_HEADERS) {
      const value = request.headers.get(key);
      if (value) forwardedHeaders[key] = value;
    }

    let bodyBase64: string | null = null;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      const body = Buffer.from(await request.arrayBuffer());
      if (body.byteLength > 0) bodyBase64 = body.toString('base64');
    }

    return fetch(options.gatewayUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        apikey: options.anonKey,
        authorization: `Bearer ${options.anonKey}`,
        'x-ce-gateway-auth': options.gatewayAuth,
      },
      body: JSON.stringify({
        method: request.method,
        path: `${target.pathname}${target.search}`,
        headers: forwardedHeaders,
        bodyBase64,
      }),
      cache: 'no-store',
    });
  }) as typeof fetch;
}

/**
 * Privileged backend client. Never import from browser code or expose the secret key.
 *
 * Primary mode uses SUPABASE_SECRET_KEY directly. A production fallback is available
 * for hosts that already contain the Telegram/API secrets but cannot safely receive a
 * Supabase service-role key: requests are tunnelled through the CE Supabase Edge
 * Gateway, which applies the service-role key inside Supabase after signed auth.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.supabase_secret_key;

  if (url && secret) {
    return createClient(url, secret, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }

  const gatewayUrl = process.env.SUPABASE_GATEWAY_URL;
  const gatewayAuth = process.env.CE_DATA_GATEWAY_SECRET || process.env.TELEGRAM_WEBHOOK_SECRET;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (url && gatewayUrl && gatewayAuth && anonKey) {
    return createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: {
        fetch: createGatewayFetch({ supabaseUrl: url, gatewayUrl, gatewayAuth, anonKey }),
      },
    });
  }

  throw new Error(
    'Supabase backend not configured: provide SUPABASE_SECRET_KEY or SUPABASE_GATEWAY_URL + SUPABASE_ANON_KEY + gateway auth',
  );
}
