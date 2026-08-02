import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pg;

let pool = null;

export function getDb() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('[Database] ⚠️ CRITICAL: DATABASE_URL environment variable is missing!');
    }

    const isLocalhost = Boolean(
      dbUrl && (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1'))
    );

    pool = new Pool({
      connectionString: dbUrl,
      // Supabase & external cloud PostgreSQL databases require SSL.
      // Enable SSL with rejectUnauthorized: false unless connecting to a local database.
      ssl: isLocalhost ? false : { rejectUnauthorized: false },
      // Optimize pool connections for Vercel serverless environment & Supabase pooler
      max: process.env.VERCEL ? 3 : 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    pool.on('error', (err) => {
      console.error('[Database] Unexpected error on idle PostgreSQL client:', err.message);
    });
  }
  return pool;
}

/**
 * PostgreSQL helper wrapper.
 * Returns an object with pg(), one(), all(), run(), and transaction() methods
 * that mirror the old SQLite API surface but use pg under the hood.
 */
export function getDbClient() {
  const pool = getDb();

  return {
    /**
     * Execute a query and return the full pg result object.
     */
    query: (sql, params = []) => pool.query(sql, params),

    /**
     * Fetch a single row (or null). Equivalent to SQLite db.get().
     */
    async get(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows[0] || null;
    },

    /**
     * Fetch all matching rows. Equivalent to SQLite db.all().
     */
    async all(sql, params = []) {
      const result = await pool.query(sql, params);
      return result.rows;
    },

    /**
     * Execute a write query. Returns { rowCount, rows }.
     * Equivalent to SQLite db.run() — use result.rows[0].id for RETURNING id,
     * or result.rowCount for number of affected rows.
     */
    async run(sql, params = []) {
      const result = await pool.query(sql, params);
      return {
        rowCount: result.rowCount,
        rows: result.rows,
        // Convenience: if a RETURNING clause was used, expose the first row
        lastID: result.rows[0]?.id || null,
        changes: result.rowCount,
      };
    },

    /**
     * Execute multiple statements inside a single transaction.
     * @param {(client: pg.PoolClient) => Promise<any>} fn - async function receiving a pg client
     */
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    },
  };
}

export async function initDb() {
  const db = getDbClient();

  // 1. Admins Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS admins (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 2. Members Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      membership_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      department TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      is_deleted INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // Migration: Ensure is_deleted column exists on members table
  const isDeletedCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'is_deleted';
  `);
  if (isDeletedCheck.rowCount === 0) {
    await db.query(`ALTER TABLE members ADD COLUMN is_deleted INTEGER DEFAULT 0;`);
    console.log('[Database] Added `is_deleted` column to members table for soft delete strategy.');
  }

  // Migration: Ensure status column exists on members table
  const statusCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'members' AND column_name = 'status';
  `);
  if (statusCheck.rowCount === 0) {
    await db.query(`ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'active';`);
    console.log('[Database] Added `status` column to members table.');
  }

  // 3. Items Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS items (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL,
      total_qty INTEGER NOT NULL CHECK(total_qty >= 0),
      available_qty INTEGER NOT NULL CHECK(available_qty >= 0),
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
  `);

  // 4. Rentals Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS rentals (
      id SERIAL PRIMARY KEY,
      item_id INTEGER NOT NULL,
      member_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      date_taken DATE NOT NULL,
      return_due_date DATE NOT NULL,
      date_returned DATE NULL,
      status TEXT NOT NULL CHECK(status IN ('Active', 'Returned', 'Overdue')),
      borrower_email TEXT DEFAULT '',
      borrower_phone TEXT DEFAULT '',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT,
      FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT
    );
  `);

  // Migration: Add borrower_email column to rentals table
  const borrowerEmailCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'rentals' AND column_name = 'borrower_email';
  `);
  if (borrowerEmailCheck.rowCount === 0) {
    await db.query(`ALTER TABLE rentals ADD COLUMN borrower_email TEXT DEFAULT '';`);
    console.log('[Database] ✅ Added `borrower_email` column to rentals table.');
  }

  // Migration: Add borrower_phone column to rentals table
  const borrowerPhoneCheck = await db.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_name = 'rentals' AND column_name = 'borrower_phone';
  `);
  if (borrowerPhoneCheck.rowCount === 0) {
    await db.query(`ALTER TABLE rentals ADD COLUMN borrower_phone TEXT DEFAULT '';`);
    console.log('[Database] ✅ Added `borrower_phone` column to rentals table.');
  }

  // 5. Email Notifications Tracking Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_notifications (
      id SERIAL PRIMARY KEY,
      rental_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('reminder', 'overdue')),
      sent_at DATE NOT NULL DEFAULT CURRENT_DATE,
      FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE CASCADE
    );
  `);

  console.log('Database initialized successfully.');
  return db;
}
