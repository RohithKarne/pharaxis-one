'use strict';

const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const SERVER_FILE = path.join(BACKEND_ROOT, 'server.js');
const ROUTES_ROOT = path.join(BACKEND_ROOT, 'routes');
const CACHE_TTL_MS = 60 * 1000;

let cache = {
  builtAt: 0,
  rows: [],
};

function inferEventTypeFromMethod(method) {
  const m = String(method || '').toUpperCase();
  if (m === 'POST') return 'create';
  if (m === 'PUT' || m === 'PATCH') return 'update';
  if (m === 'DELETE') return 'delete';
  if (m === 'JOB') return 'job';
  if (m === 'SCHEMA') return 'schema_change';
  return 'read';
}

function inferModule(pathname) {
  const p = String(pathname || '').toLowerCase();
  if (p.includes('/auth')) return 'Auth';
  if (p.includes('/inbox')) return 'Inbox';
  if (p.includes('/cases') || p.includes('/case')) return 'Case Management';
  if (p.includes('/admin')) return 'Admin Console';
  if (p.includes('/superadmin')) return 'Platform Admin';
  if (p.includes('/cm')) return 'Content';
  if (p.includes('/analytics')) return 'Analytics';
  if (p.includes('/dv')) return 'Data Visualization';
  return 'Core';
}

function deriveEntity(pathname) {
  const parts = String(pathname || '')
    .split('/')
    .filter(Boolean)
    .filter(p => p !== 'api' && !/^[0-9]+$/.test(p));
  if (!parts.length) return 'resource';
  return parts[parts.length - 1];
}

function normalizeJoinedPath(prefix, routePath) {
  const rawPrefix = String(prefix || '').trim();
  const rawRoute = String(routePath || '').trim();
  const left = rawPrefix === '/' ? '' : rawPrefix.replace(/\/+$/, '');
  const right = rawRoute === '/' ? '' : rawRoute.replace(/^\/+/, '');
  const out = `${left}/${right}`.replace(/\/+/g, '/');
  return out.startsWith('/') ? out : `/${out}`;
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function collectAliasRequireMap(serverContent) {
  const out = new Map();
  const aliasRegex = /const\s+\{\s*router\s*:\s*([A-Za-z0-9_]+)\s*\}\s*=\s*require\('(\.\/routes\/[^']+)'\)/g;
  let m;
  while ((m = aliasRegex.exec(serverContent)) !== null) {
    const alias = m[1];
    const rel = m[2].replace(/^\.\//, '');
    out.set(alias, rel.endsWith('.js') ? rel : `${rel}.js`);
  }
  return out;
}

function collectMountedRouteFiles(serverContent, aliasMap) {
  const mounted = [];

  const directRequireRegex = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*require\('(\.\/routes\/[^']+)'\)\s*\)/g;
  let m;
  while ((m = directRequireRegex.exec(serverContent)) !== null) {
    const prefix = m[1];
    const rel = m[2].replace(/^\.\//, '');
    mounted.push({ prefix, routeRel: rel.endsWith('.js') ? rel : `${rel}.js` });
  }

  const aliasUseRegex = /app\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*([A-Za-z0-9_]+)\s*\)/g;
  while ((m = aliasUseRegex.exec(serverContent)) !== null) {
    const prefix = m[1];
    const alias = m[2];
    const routeRel = aliasMap.get(alias);
    if (routeRel) mounted.push({ prefix, routeRel });
  }

  return mounted;
}

function parseRouterMethodEntries(routeFileAbs, mountPrefix, routeRel) {
  const content = readFileSafe(routeFileAbs);
  if (!content) return [];

  const out = [];
  const simpleRegex = /\brouter\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/g;
  let m;
  while ((m = simpleRegex.exec(content)) !== null) {
    const method = String(m[1]).toUpperCase();
    const routePath = m[2];
    const fullPath = normalizeJoinedPath(mountPrefix, routePath);
    out.push({ method, path_pattern: fullPath, route_file: `mims/backend/${routeRel}` });
  }

  return out;
}

function parseDirectServerRoutes(serverContent) {
  const out = [];
  const rx = /\bapp\.(get|post|put|patch|delete)\(\s*['"`](\/api\/[^'"`]+)['"`]/g;
  let m;
  while ((m = rx.exec(serverContent)) !== null) {
    out.push({
      method: String(m[1]).toUpperCase(),
      path_pattern: m[2],
    });
  }
  return out;
}

function appendServiceActions(rows) {
  rows.push(
    {
      method: 'JOB',
      path_pattern: '/jobs/email-poller',
      source_module: 'Background Jobs',
      event_type: 'job',
      entity_type: 'email-poller',
      coverage_source: 'catalog',
    },
    {
      method: 'SCHEMA',
      path_pattern: '/schema/tracker',
      source_module: 'Schema Tracker',
      event_type: 'schema_change',
      entity_type: 'schema',
      coverage_source: 'catalog',
    }
  );
}

function buildCatalogRows() {
  const serverContent = readFileSafe(SERVER_FILE);
  const aliasMap = collectAliasRequireMap(serverContent);
  const mounted = collectMountedRouteFiles(serverContent, aliasMap);
  const directRoutes = parseDirectServerRoutes(serverContent);

  const rows = [];
  for (const item of mounted) {
    const routeFileAbs = path.join(BACKEND_ROOT, item.routeRel);
    const routeRows = parseRouterMethodEntries(routeFileAbs, item.prefix, item.routeRel);
    for (const rr of routeRows) rows.push(rr);
  }
  for (const rr of directRoutes) rows.push(rr);

  const dedup = new Map();
  for (const row of rows) {
    const pathPattern = row.path_pattern;
    const method = row.method;
    const key = `${method} ${pathPattern}`;
    if (dedup.has(key)) continue;
    dedup.set(key, {
      method,
      path_pattern: pathPattern,
      source_module: inferModule(pathPattern),
      event_type: inferEventTypeFromMethod(method),
      entity_type: deriveEntity(pathPattern),
      route_file: row.route_file || null,
      coverage_source: 'catalog',
    });
  }

  const merged = Array.from(dedup.values());
  appendServiceActions(merged);

  merged.sort((a, b) => {
    const sm = String(a.source_module).localeCompare(String(b.source_module));
    if (sm !== 0) return sm;
    const pm = String(a.path_pattern).localeCompare(String(b.path_pattern));
    if (pm !== 0) return pm;
    return String(a.method).localeCompare(String(b.method));
  });

  return merged;
}

function getRouteServiceCatalog({ force = false } = {}) {
  const now = Date.now();
  if (!force && cache.rows.length && now - cache.builtAt < CACHE_TTL_MS) {
    return cache.rows;
  }

  const rows = buildCatalogRows();
  cache = { builtAt: now, rows };
  return rows;
}

module.exports = {
  getRouteServiceCatalog,
};
