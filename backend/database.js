import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create data directory if it doesn't exist
const dataDir = join(__dirname, 'data');
try {
  mkdirSync(dataDir, { recursive: true });
} catch (err) {
  // Directory already exists
}

const dbPath = process.env.DATABASE_PATH || join(dataDir, 'sessions.db');
const db = new Database(dbPath);

// Enable WAL mode for better concurrency
db.pragma('journal_mode = WAL');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    context TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    logging_enabled_snapshot INTEGER NOT NULL,
    summary_status TEXT DEFAULT 'pending',
    model TEXT,
    duration_minutes INTEGER
  );
  
  -- Add model column if it doesn't exist (for existing databases)
  -- This will fail silently if the column already exists
  -- ALTER TABLE sessions ADD COLUMN model TEXT;
  -- ALTER TABLE sessions ADD COLUMN duration_minutes INTEGER;

  CREATE TABLE IF NOT EXISTS turns (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    speaker TEXT NOT NULL,
    text TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS summaries (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary_text TEXT NOT NULL,
    action_items TEXT NOT NULL,
    tags TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
  );

  -- User subscription and usage tracking
  CREATE TABLE IF NOT EXISTS user_subscriptions (
    user_id TEXT PRIMARY KEY,
    subscription_tier TEXT NOT NULL DEFAULT 'free',
    monthly_minutes_limit INTEGER,
    billing_period_start TEXT NOT NULL,
    billing_period_end TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Monthly usage tracking per user
  CREATE TABLE IF NOT EXISTS monthly_usage (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    year INTEGER NOT NULL,
    month INTEGER NOT NULL,
    used_minutes INTEGER NOT NULL DEFAULT 0,
    UNIQUE(user_id, year, month)
  );

  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
  CREATE INDEX IF NOT EXISTS idx_turns_session_id ON turns(session_id);
  CREATE INDEX IF NOT EXISTS idx_summaries_session_id ON summaries(session_id);
  CREATE INDEX IF NOT EXISTS idx_monthly_usage_user_period ON monthly_usage(user_id, year, month);
`);

export default db;
