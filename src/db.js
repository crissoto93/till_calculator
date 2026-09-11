const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// Configurable DB path (defaults to ./data/till.db)
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'till.db');

// Ensure parent folder exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new DatabaseSync(DB_PATH);

// Enable WAL mode for reliability and performance
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS closings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    drawer_float REAL NOT NULL DEFAULT 200.00,
    expected_amount REAL NOT NULL DEFAULT 0.00,
    total_cash REAL NOT NULL,
    deposit_amount REAL NOT NULL,
    discrepancy REAL NOT NULL,
    cash_tips REAL DEFAULT 0.00,
    count_100 INTEGER DEFAULT 0,
    count_50 INTEGER DEFAULT 0,
    count_20 INTEGER DEFAULT 0,
    count_10 INTEGER DEFAULT 0,
    count_5 INTEGER DEFAULT 0,
    count_1 INTEGER DEFAULT 0,
    count_025 INTEGER DEFAULT 0,
    count_010 INTEGER DEFAULT 0,
    count_005 INTEGER DEFAULT 0,
    count_001 INTEGER DEFAULT 0,
    roll_25 INTEGER DEFAULT 0,
    roll_10 INTEGER DEFAULT 0,
    roll_5 INTEGER DEFAULT 0,
    roll_1 INTEGER DEFAULT 0,
    breakdown_json TEXT NOT NULL,
    notes TEXT DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// Migration: Ensure cash_tips and coin roll columns exist in existing SQLite databases
try {
  const tableInfo = db.prepare('PRAGMA table_info(closings)').all();
  const existingCols = new Set(tableInfo.map(col => col.name));

  if (!existingCols.has('cash_tips')) {
    db.exec('ALTER TABLE closings ADD COLUMN cash_tips REAL DEFAULT 0.00;');
    console.log('[DB Migration] Added cash_tips column to closings table.');
  }
  if (!existingCols.has('roll_25')) {
    db.exec('ALTER TABLE closings ADD COLUMN roll_25 INTEGER DEFAULT 0;');
    console.log('[DB Migration] Added roll_25 column to closings table.');
  }
  if (!existingCols.has('roll_10')) {
    db.exec('ALTER TABLE closings ADD COLUMN roll_10 INTEGER DEFAULT 0;');
    console.log('[DB Migration] Added roll_10 column to closings table.');
  }
  if (!existingCols.has('roll_5')) {
    db.exec('ALTER TABLE closings ADD COLUMN roll_5 INTEGER DEFAULT 0;');
    console.log('[DB Migration] Added roll_5 column to closings table.');
  }
  if (!existingCols.has('roll_1')) {
    db.exec('ALTER TABLE closings ADD COLUMN roll_1 INTEGER DEFAULT 0;');
    console.log('[DB Migration] Added roll_1 column to closings table.');
  }
} catch (err) {
  console.error('[DB Migration error]', err);
}

/**
 * Insert a new till closing record (Append-only).
 */
function insertClosing(data) {
  const stmt = db.prepare(`
    INSERT INTO closings (
      created_at, employee_name, drawer_float, expected_amount,
      total_cash, deposit_amount, discrepancy, cash_tips,
      count_100, count_50, count_20, count_10, count_5, count_1,
      count_025, count_010, count_005, count_001,
      roll_25, roll_10, roll_5, roll_1,
      breakdown_json, notes
    ) VALUES (
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?
    )
  `);

  const breakdown = data.breakdown || {};
  const createdAt = data.created_at || new Date().toISOString();

  const result = stmt.run(
    createdAt,
    data.employee_name.trim(),
    Number(data.drawer_float) || 200.0,
    Number(data.expected_amount) || 0.0,
    Number(data.total_cash) || 0.0,
    Number(data.deposit_amount) || 0.0,
    Number(data.discrepancy) || 0.0,
    Number(data.cash_tips) || 0.0,
    Number(breakdown.bill_100?.count) || 0,
    Number(breakdown.bill_50?.count) || 0,
    Number(breakdown.bill_20?.count) || 0,
    Number(breakdown.bill_10?.count) || 0,
    Number(breakdown.bill_5?.count) || 0,
    Number(breakdown.bill_1?.count) || 0,
    Number(breakdown.coin_25?.count) || 0,
    Number(breakdown.coin_10?.count) || 0,
    Number(breakdown.coin_5?.count) || 0,
    Number(breakdown.coin_1?.count) || 0,
    Number(breakdown.roll_25?.count) || 0,
    Number(breakdown.roll_10?.count) || 0,
    Number(breakdown.roll_5?.count) || 0,
    Number(breakdown.roll_1?.count) || 0,
    JSON.stringify(breakdown),
    data.notes ? data.notes.trim() : ''
  );

  return {
    id: result.lastInsertRowid,
    created_at: createdAt,
    employee_name: data.employee_name.trim(),
    total_cash: Number(data.total_cash) || 0.0,
    drawer_float: Number(data.drawer_float) || 200.0,
    expected_amount: Number(data.expected_amount) || 0.0,
    deposit_amount: Number(data.deposit_amount) || 0.0,
    discrepancy: Number(data.discrepancy) || 0.0,
    cash_tips: Number(data.cash_tips) || 0.0,
    notes: data.notes ? data.notes.trim() : '',
  };
}

/**
 * Fetch all closings for Admin view, ordered latest first.
 */
function getAllClosings(limit = 500, offset = 0) {
  const stmt = db.prepare(`
    SELECT * FROM closings
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(limit, offset);
}

/**
 * Get closing summary statistics for Admin dashboard.
 */
function getClosingStats() {
  const countStmt = db.prepare('SELECT COUNT(*) as total_closings, SUM(deposit_amount) as total_deposits, SUM(total_cash) as total_cash_counted, SUM(cash_tips) as total_cash_tips FROM closings');
  const stats = countStmt.get();
  return {
    totalClosings: stats.total_closings || 0,
    totalDeposits: stats.total_deposits || 0,
    totalCashCounted: stats.total_cash_counted || 0,
    totalCashTips: stats.total_cash_tips || 0,
  };
}

/**
 * Get setting value by key.
 */
function getSetting(key) {
  const stmt = db.prepare('SELECT value FROM settings WHERE key = ?');
  const row = stmt.get(key);
  return row ? row.value : null;
}

/**
 * Set setting value.
 */
function setSetting(key, value) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET
      value = excluded.value,
      updated_at = excluded.updated_at
  `);
  stmt.run(key, String(value), new Date().toISOString());
}

module.exports = {
  db,
  DB_PATH,
  insertClosing,
  getAllClosings,
  getClosingStats,
  getSetting,
  setSetting,
};
