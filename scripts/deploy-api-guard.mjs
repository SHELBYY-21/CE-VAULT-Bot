// Read-only deploy decision gate. Does not call Render or mutate production.
// Caller must serialize decisions per service (distributed lock) before acting.
export function assessDeploy({ targetSha, deploys, now = Date.now(), windowMs = 20 * 60_000 }) {
  if (!/^[0-9a-f]{40}$/i.test(targetSha || '')) return { allow: false, reason: 'invalid_sha' };
  if (!Array.isArray(deploys) || !Number.isFinite(now) || windowMs <= 0) return { allow: false, reason: 'invalid_input' };
  for (const d of deploys) {
    if (d?.commit?.id !== targetSha) continue;
    if (['live', 'build_in_progress', 'update_in_progress', 'pre_deploy_in_progress', 'created'].includes(d.status)) {
      return { allow: false, reason: 'already_live_or_in_progress', deployId: d.id };
    }
    const started = Date.parse(d.createdAt || '');
    if (d.trigger === 'api' && Number.isFinite(started) && started <= now && now - started <= windowMs) {
      return { allow: false, reason: 'recent_api_deploy', deployId: d.id };
    }
  }
  return { allow: true, reason: 'no_duplicate_detected' };
}
