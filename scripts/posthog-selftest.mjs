const enabled = process.env.CE_ANALYTICS_SELFTEST === '1';
const key = process.env.VITE_PUBLIC_POSTHOG_KEY || '';
const host = (process.env.VITE_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com').replace(/\/$/, '');
const version = process.env.VITE_CE_APP_VERSION || 'preview';

if (!enabled) process.exit(0);
if (!key) {
  console.warn('[CE Analytics] Self-test skipped: public PostHog key missing.');
  process.exit(0);
}

try {
  const response = await fetch(`${host}/capture/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      api_key: key,
      event: 'ce_preview_booted',
      properties: {
        distinct_id: 'ce-preview-runtime',
        $process_person_profile: false,
        sandbox: true,
        app_version: version,
        source: 'render-preview-selftest'
      }
    })
  });
  if (!response.ok) throw new Error(`HTTP_${response.status}`);
  console.log('[CE Analytics] PostHog preview self-test accepted.');
} catch (error) {
  console.error(`[CE Analytics] PostHog preview self-test failed: ${error?.message || 'unknown'}`);
}
