import pg from 'pg';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
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

  // Bootstrap the first administrator for a fresh deployment. Existing
  // credentials are never overwritten during normal application startup.
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (adminPassword) {
    const existingAdmin = await db.get(
      'SELECT id FROM admins WHERE username = $1',
      [adminUsername]
    );
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await db.run(
        'INSERT INTO admins (username, password_hash) VALUES ($1, $2)',
        [adminUsername, passwordHash]
      );
      console.log(`[Database] Initial administrator created: ${adminUsername}`);
    } else {
      const storedAdmin = await db.get(
        'SELECT password_hash FROM admins WHERE id = $1',
        [existingAdmin.id]
      );
      const passwordMatches = await bcrypt.compare(adminPassword, storedAdmin.password_hash);
      if (!passwordMatches) {
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        await db.run(
          'UPDATE admins SET password_hash = $1 WHERE id = $2',
          [passwordHash, existingAdmin.id]
        );
        console.log(`[Database] Administrator credential synchronized: ${adminUsername}`);
      }
    }
  } else {
    const adminCount = await db.get('SELECT COUNT(*)::int AS count FROM admins');
    if (adminCount.count === 0) {
      console.warn('[Database] ADMIN_PASSWORD is not configured; no administrator account was created.');
    }
  }

  // 2. Members Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      id SERIAL PRIMARY KEY,
      membership_id TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      class_name TEXT DEFAULT '',
      department TEXT NOT NULL,
      status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive')),
      membership_expiry_date DATE,
      last_renewed_at TIMESTAMPTZ,
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

  const memberColumns = [
    ['class_name', `ALTER TABLE members ADD COLUMN class_name TEXT DEFAULT '';`],
    ['membership_expiry_date', 'ALTER TABLE members ADD COLUMN membership_expiry_date DATE;'],
    ['last_renewed_at', 'ALTER TABLE members ADD COLUMN last_renewed_at TIMESTAMPTZ;']
  ];
  for (const [columnName, migrationSql] of memberColumns) {
    const columnCheck = await db.query(
      `SELECT 1 FROM information_schema.columns WHERE table_name = 'members' AND column_name = $1`,
      [columnName]
    );
    if (columnCheck.rowCount === 0) {
      await db.query(migrationSql);
      console.log(`[Database] Added members.${columnName}.`);
    }
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
      renewal_count INTEGER NOT NULL DEFAULT 0,
      last_renewed_at TIMESTAMPTZ,
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

  await db.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS renewal_count INTEGER NOT NULL DEFAULT 0;`);
  await db.query(`ALTER TABLE rentals ADD COLUMN IF NOT EXISTS last_renewed_at TIMESTAMPTZ;`);

  await db.query(`
    CREATE TABLE IF NOT EXISTS rental_renewals (
      id SERIAL PRIMARY KEY,
      rental_id INTEGER NOT NULL,
      previous_due_date DATE NOT NULL,
      new_due_date DATE NOT NULL,
      renewed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      renewed_by TEXT NOT NULL DEFAULT 'admin',
      email_message_id TEXT,
      email_sent_at TIMESTAMPTZ,
      FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE CASCADE
    );
  `);
  await db.query(`ALTER TABLE rental_renewals ADD COLUMN IF NOT EXISTS email_message_id TEXT;`);
  await db.query(`ALTER TABLE rental_renewals ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;`);

  // 5. Email Notifications Tracking Table
  await db.query(`
    CREATE TABLE IF NOT EXISTS email_notifications (
      id SERIAL PRIMARY KEY,
      rental_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('reminder', 'overdue')),
      sent_at DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE CASCADE
    );
  `);

  await db.query(`ALTER TABLE email_notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;`);

  console.log('Database initialized successfully.');
  return db;
}
