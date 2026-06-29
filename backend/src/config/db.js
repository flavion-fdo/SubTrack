const sqlite3 = require('sqlite3');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const dbFile = process.env.DATABASE_FILE || 'database.sqlite';
const dbPath = path.resolve(__dirname, '../../', dbFile);

// Create SQLite connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error connecting to SQLite database:', err.message);
  } else {
    console.log(`Connected to SQLite database at: ${dbPath}`);
  }
});

// Promisified helper functions for SQLite
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// Initialize Database Tables
const initDatabase = async () => {
  try {
    // Enable Write-Ahead Logging (WAL) for concurrency optimization
    await dbRun('PRAGMA journal_mode=WAL;');

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

    console.log('Database tables initialized successfully.');
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
  }
};

module.exports = {
  db,
  dbRun,
  dbGet,
  dbAll,
  initDatabase
};
