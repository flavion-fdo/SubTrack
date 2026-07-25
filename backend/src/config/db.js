const { createClient } = require('@libsql/client');
const path = require('path');
require('dotenv').config();

// ─── Database Client ────────────────────────────────────────────────────────
// Uses Turso (remote LibSQL) in production, local SQLite file in development.
// @libsql/client speaks the same SQL dialect as SQLite, so all existing
// queries work without modification.

const isRemote = !!process.env.TURSO_DATABASE_URL;

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || `file:${path.resolve(__dirname, '../../database.sqlite')}`,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

console.log(`Connected to database: ${isRemote ? 'Turso (remote)' : 'SQLite (local file)'}`);

// ─── Promisified Helper Functions ───────────────────────────────────────────
// These maintain the same interface as the previous sqlite3 wrappers so that
// all existing controllers/services continue to work unchanged.

const dbRun = async (sql, params = []) => {
  const result = await client.execute({ sql, args: params });
  return {
    id: result.lastInsertRowid != null ? Number(result.lastInsertRowid) : 0,
    changes: result.rowsAffected
  };
};

const dbGet = async (sql, params = []) => {
  const result = await client.execute({ sql, args: params });
  const row = result.rows[0];
  // Convert to plain object for consistent behavior with JSON serialization
  return row ? Object.assign({}, row) : undefined;
};

const dbAll = async (sql, params = []) => {
  const result = await client.execute({ sql, args: params });
  // Convert each Row to a plain object
  return result.rows.map(row => Object.assign({}, row));
};

// ─── Initialize Database Tables ─────────────────────────────────────────────
// Uses CREATE TABLE IF NOT EXISTS, so safe to call on every cold start.

let dbInitialized = false;

const initDatabase = async () => {
  if (dbInitialized) return;

  try {
    // Enable WAL mode for local SQLite (ignored by Turso remote)
    if (!isRemote) {
      try {
        await dbRun('PRAGMA journal_mode=WAL;');
      } catch {
        // WAL pragma not supported on remote — safe to ignore
      }
    }

    // 1. Users Table (password nullable for OAuth users)
    await dbRun(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password TEXT,
        auth_provider TEXT NOT NULL DEFAULT 'local',
        provider_id TEXT,
        display_name TEXT,
        avatar_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration: add columns if upgrading from older schema
    const cols = await dbAll("PRAGMA table_info(users)");
    const colNames = cols.map(c => c.name);
    if (!colNames.includes('auth_provider')) {
      await dbRun("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'local'");
    }
    if (!colNames.includes('provider_id')) {
      await dbRun("ALTER TABLE users ADD COLUMN provider_id TEXT");
    }
    if (!colNames.includes('display_name')) {
      await dbRun("ALTER TABLE users ADD COLUMN display_name TEXT");
    }
    if (!colNames.includes('avatar_url')) {
      await dbRun("ALTER TABLE users ADD COLUMN avatar_url TEXT");
    }

    // 2. Subscriptions Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS subscriptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        service_name TEXT NOT NULL,
        cost REAL NOT NULL,
        billing_cycle TEXT NOT NULL CHECK(billing_cycle IN ('monthly', 'yearly')),
        next_renewal_date DATE NOT NULL,
        category TEXT NOT NULL CHECK(category IN ('Entertainment', 'Software', 'Utilities', 'Other')),
        alert_days_before INTEGER NOT NULL DEFAULT 3,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Migration for subscriptions: add alert_days_before column if it doesn't exist
    const subCols = await dbAll("PRAGMA table_info(subscriptions)");
    const subColNames = subCols.map(c => c.name);
    if (!subColNames.includes('alert_days_before')) {
      await dbRun("ALTER TABLE subscriptions ADD COLUMN alert_days_before INTEGER NOT NULL DEFAULT 3");
    }

    // 3. Alert History Table
    await dbRun(`
      CREATE TABLE IF NOT EXISTS alert_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subscription_id INTEGER NOT NULL,
        renewal_date DATE NOT NULL,
        alert_type TEXT NOT NULL DEFAULT 'custom',
        sent_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE CASCADE
      )
    `);

    // Migration for alert_history: add alert_type column if it doesn't exist
    const alertCols = await dbAll("PRAGMA table_info(alert_history)");
    const alertColNames = alertCols.map(c => c.name);
    if (!alertColNames.includes('alert_type')) {
      await dbRun("ALTER TABLE alert_history ADD COLUMN alert_type TEXT NOT NULL DEFAULT 'custom'");
    }

    dbInitialized = true;
    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
};

module.exports = {
  client,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};
