function toIso(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString();
}

export function normalizeTimelineEvent(row) {
  const actionKey = row?.action_key || row?.event_type || row?.eventType || 'event';
  const actorUserId = row?.actor_user_id || row?.actorUserId || row?.updated_by || row?.created_by || null;
  const occurredAt = toIso(row?.occurred_at || row?.created_at || row?.updated_at);
  const payload = row?.payload_json || row?.payloadJson || {};

  const payloadText = Object.entries(payload)
    .slice(0, 4)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ');

  return {
    id: row?.id || `${actionKey}:${occurredAt}`,
    actionKey,
    actorUserId,
    occurredAt,
    payload,
    summary: payloadText || 'No payload details'
  };
}

export function normalizeTimelineRows(rows) {
  const list = Array.isArray(rows) ? rows : [];
  return list
    .map((row) => normalizeTimelineEvent(row))
    .sort((left, right) => String(right.occurredAt).localeCompare(String(left.occurredAt)));
}
