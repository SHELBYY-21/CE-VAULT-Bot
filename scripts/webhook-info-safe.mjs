function finiteOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function safeWebhookInfo(info) {
  const value = info && typeof info === 'object' ? info : {};
  const pending = finiteOrNull(value.pending_update_count);
  const maxConnections = finiteOrNull(value.max_connections);
  const lastErrorDate = finiteOrNull(value.last_error_date);
  const lastSyncErrorDate = finiteOrNull(value.last_synchronization_error_date);

  return Object.freeze({
    pending_update_count: pending == null ? 0 : Math.max(0, pending),
    ip_address: typeof value.ip_address === 'string' && value.ip_address.trim() ? value.ip_address.trim() : null,
    last_error_date: lastErrorDate,
    last_error_message:
      typeof value.last_error_message === 'string' && value.last_error_message.trim()
        ? value.last_error_message.trim().slice(0, 240)
        : null,
    last_synchronization_error_date: lastSyncErrorDate,
    max_connections: maxConnections,
    allowed_updates: Array.isArray(value.allowed_updates)
      ? value.allowed_updates.filter((item) => typeof item === 'string').slice(0, 20)
      : [],
  });
}
