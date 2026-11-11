'use strict';
// SQLite embutido (node:sqlite) — sem módulo nativo. Uma conexão por thread.
const { DatabaseSync } = require('node:sqlite');
const MIGRATIONS = require('./migrations');

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA synchronous = NORMAL;');
  migrate(db);
  return db;
}

function migrate(db) {
  const v = db.prepare('PRAGMA user_version').get().user_version;
  for (let i = v; i < MIGRATIONS.length; i++) {
    tx(db, () => { db.exec(MIGRATIONS[i]); db.exec(`PRAGMA user_version = ${i + 1}`); });
  }
}

function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
}

const getKV = (db, key, def) => { const r = db.prepare('SELECT value FROM settings_kv WHERE key = ?').get(key); return r ? JSON.parse(r.value) : def; };
const setKV = (db, key, value) => db.prepare('INSERT INTO settings_kv(key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, JSON.stringify(value));

module.exports = { open, migrate, tx, getKV, setKV };
