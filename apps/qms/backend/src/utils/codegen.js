export function makeEntityCode(prefix, title) {
  const seed = String(title || 'item')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 16);
  return `${prefix}-${seed || 'QMS'}-${Date.now().toString().slice(-6)}`;
}

export function asDateString(value) {
  if (!value) return null;
  const dt = new Date(value);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

