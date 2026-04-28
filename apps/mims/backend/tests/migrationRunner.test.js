jest.mock('bcrypt', () => ({
  hash: jest.fn(async () => 'mock-hash'),
}));

const Module = require('module');

function makeConn({ userTableExists, appliedBefore = [] }) {
  const state = {
    applied: new Set(appliedBefore),
    calls: [],
  };

  const conn = {
    async execute(sql, params = []) {
      const norm = String(sql).replace(/\s+/g, ' ').trim();
      state.calls.push({ sql: norm, params });

      if (norm.includes('FROM information_schema.tables') && norm.includes("table_name = 'users'")) {
        return [[{ cnt: userTableExists ? 1 : 0 }]];
      }

      if (norm === 'SELECT filename FROM schema_migrations') {
        return [[...state.applied].map(filename => ({ filename }))];
      }

      if (norm.startsWith('INSERT IGNORE INTO schema_migrations')) {
        state.applied.add(params[0]);
        return [{ affectedRows: 1 }];
      }

      if (norm.startsWith('INSERT INTO schema_migrations')) {
        state.applied.add(params[0]);
        return [{ affectedRows: 1 }];
      }

      return [[{ ok: 1 }]];
    },
  };

  return { conn, state };
}

describe('migrationRunner bootstrap and apply behavior', () => {
  let originalFsReadDir;
  let originalModuleRequire;
  let fakeMigrationUps;

  const files = [
    '001_core_auth.js',
    '002_email_inbox.js',
    '003_picklists_config.js',
  ];

  beforeEach(() => {
    jest.resetModules();
    fakeMigrationUps = new Map();

    const fs = require('fs');
    originalFsReadDir = fs.readdirSync;
    fs.readdirSync = jest.fn(() => files);

    originalModuleRequire = Module.prototype.require;
    Module.prototype.require = function patchedRequire(request) {
      if (typeof request === 'string' && request.includes('migrations') && /\d{3}_.+\.js$/.test(request)) {
        if (!fakeMigrationUps.has(request)) {
          fakeMigrationUps.set(request, jest.fn(async () => {}));
        }
        return { up: fakeMigrationUps.get(request) };
      }
      return originalModuleRequire.call(this, request);
    };
  });

  afterEach(() => {
    const fs = require('fs');
    fs.readdirSync = originalFsReadDir;
    Module.prototype.require = originalModuleRequire;
  });

  test('existing DB + empty schema_migrations: stamps all but last, applies last', async () => {
    const { runMigrations } = require('../database/migrationRunner');
    const { conn, state } = makeConn({ userTableExists: true, appliedBefore: [] });

    await runMigrations(conn, 'pharaxis_mims_dev');

    expect(state.applied.has('001_core_auth.js')).toBe(true);
    expect(state.applied.has('002_email_inbox.js')).toBe(true);
    expect(state.applied.has('003_picklists_config.js')).toBe(true);

    const ignoredInserts = state.calls.filter(c => c.sql.startsWith('INSERT IGNORE INTO schema_migrations'));
    expect(ignoredInserts.map(c => c.params[0])).toEqual(['001_core_auth.js', '002_email_inbox.js']);

    const normalInserts = state.calls.filter(c => c.sql.startsWith('INSERT INTO schema_migrations'));
    expect(normalInserts.map(c => c.params[0])).toEqual(['003_picklists_config.js']);
  });

  test('fresh DB: applies all migrations in order', async () => {
    const { runMigrations } = require('../database/migrationRunner');
    const { conn, state } = makeConn({ userTableExists: false, appliedBefore: [] });

    await runMigrations(conn, 'pharaxis_mims_dev');

    const normalInserts = state.calls.filter(c => c.sql.startsWith('INSERT INTO schema_migrations'));
    expect(normalInserts.map(c => c.params[0])).toEqual(files);

    const ignoredInserts = state.calls.filter(c => c.sql.startsWith('INSERT IGNORE INTO schema_migrations'));
    expect(ignoredInserts).toHaveLength(0);
  });

  test('existing DB + all already applied: runs nothing new', async () => {
    const { runMigrations } = require('../database/migrationRunner');
    const { conn, state } = makeConn({ userTableExists: true, appliedBefore: files });

    await runMigrations(conn, 'pharaxis_mims_dev');

    const normalInserts = state.calls.filter(c => c.sql.startsWith('INSERT INTO schema_migrations'));
    const ignoredInserts = state.calls.filter(c => c.sql.startsWith('INSERT IGNORE INTO schema_migrations'));

    expect(normalInserts).toHaveLength(0);
    expect(ignoredInserts).toHaveLength(0);
  });
});
