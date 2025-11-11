import pkg from 'pg';
const { Pool } = pkg;

// Use DATABASE_URL from Railway or fall back to local SQLite for development
const databaseUrl = process.env.DATABASE_URL;
const usePostgres = !!databaseUrl;

let pool;
let db;

if (usePostgres) {
  console.log('✅ Using PostgreSQL database');
  pool = new Pool({
    connectionString: databaseUrl,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
  });

  // Test connection
  pool.query('SELECT NOW()', (err, res) => {
    if (err) {
      console.error('❌ PostgreSQL connection error:', err);
    } else {
      console.log('✅ PostgreSQL connected successfully');
    }
  });

  // Create tables
  const createTables = async () => {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          context TEXT NOT NULL,
          started_at TIMESTAMPTZ NOT NULL,
          ended_at TIMESTAMPTZ,
          logging_enabled_snapshot BOOLEAN NOT NULL,
          summary_status TEXT DEFAULT 'pending',
          model TEXT,
          duration_minutes INTEGER
        );

        CREATE TABLE IF NOT EXISTS turns (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL,
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
          created_at TIMESTAMPTZ NOT NULL,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS user_subscriptions (
          user_id TEXT PRIMARY KEY,
          subscription_tier TEXT NOT NULL DEFAULT 'free',
          monthly_minutes_limit INTEGER,
          billing_period_start TIMESTAMPTZ NOT NULL,
          billing_period_end TIMESTAMPTZ NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL
        );

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
      console.log('✅ PostgreSQL tables created/verified');
    } catch (err) {
      console.error('❌ Error creating PostgreSQL tables:', err);
    } finally {
      client.release();
    }
  };

  createTables();

  // PostgreSQL wrapper with better-sqlite3-like interface
  db = {
    name: databaseUrl.split('/').pop(),
    prepare: (sql) => {
      // Convert ? placeholders to $1, $2, etc for PostgreSQL
      let paramIndex = 1;
      const pgSql = sql.replace(/\?/g, () => `$${paramIndex++}`);

      return {
        run: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(pgSql, params);
            return { changes: result.rowCount };
          } finally {
            client.release();
          }
        },
        get: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(pgSql, params);
            return result.rows[0] || null;
          } finally {
            client.release();
          }
        },
        all: async (...params) => {
          const client = await pool.connect();
          try {
            const result = await client.query(pgSql, params);
            return result.rows;
          } finally {
            client.release();
          }
        }
      };
    }
  };
} else {
  // Fall back to SQLite for local development
  console.log('⚠️  DATABASE_URL not found, using SQLite for local development');
  const Database = (await import('better-sqlite3')).default;
  const { fileURLToPath } = await import('url');
  const { dirname, join } = await import('path');
  const { mkdirSync } = await import('fs');

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const dataDir = join(__dirname, 'data');
  try {
    mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    // Directory already exists
  }

  const dbPath = process.env.DATABASE_PATH || join(dataDir, 'sessions.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

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

    CREATE TABLE IF NOT EXISTS user_subscriptions (
      user_id TEXT PRIMARY KEY,
      subscription_tier TEXT NOT NULL DEFAULT 'free',
      monthly_minutes_limit INTEGER,
      billing_period_start TEXT NOT NULL,
      billing_period_end TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

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

  console.log('✅ SQLite tables created/verified');
}

export default db;
export { usePostgres };
