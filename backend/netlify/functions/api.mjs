import serverlessHttp from 'serverless-http';
import pg from 'pg';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import * as XLSX from 'xlsx';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// ── Database Pool ───────────────────────────────────────────────────────────────
let pool = null;

function getPool() {
  if (!pool) {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) throw new Error('DATABASE_URL is not set. Add it in Netlify → Site Settings → Environment Variables.');
    pool = new Pool({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      max: 3,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    pool.on('error', (err) => console.error('[DB] Idle error:', err.message));
  }
  return pool;
}

const db = {
  query: (sql, p = []) => getPool().query(sql, p),
  async get(sql, p = []) { const r = await getPool().query(sql, p); return r.rows[0] || null; },
  async all(sql, p = []) { const r = await getPool().query(sql, p); return r.rows; },
  async run(sql, p = []) {
    const r = await getPool().query(sql, p);
    return { rowCount: r.rowCount, rows: r.rows, lastID: r.rows[0]?.id || null, changes: r.rowCount };
  },
  async transaction(fn) {
    const client = await getPool().connect();
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
  }
};

async function initDb() {
  await db.query(`CREATE TABLE IF NOT EXISTS admins (id SERIAL PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
  await db.query(`CREATE TABLE IF NOT EXISTS members (id SERIAL PRIMARY KEY, membership_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT, department TEXT NOT NULL, status TEXT DEFAULT 'active' CHECK(status IN ('active','inactive')), is_deleted INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
  await db.query(`CREATE TABLE IF NOT EXISTS items (id SERIAL PRIMARY KEY, name TEXT NOT NULL, description TEXT, category TEXT NOT NULL, total_qty INTEGER NOT NULL CHECK(total_qty >= 0), available_qty INTEGER NOT NULL CHECK(available_qty >= 0), created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP);`);
  await db.query(`CREATE TABLE IF NOT EXISTS rentals (id SERIAL PRIMARY KEY, item_id INTEGER NOT NULL, member_id INTEGER NOT NULL, quantity INTEGER NOT NULL DEFAULT 1, date_taken DATE NOT NULL, return_due_date DATE NOT NULL, date_returned DATE NULL, status TEXT NOT NULL CHECK(status IN ('Active','Returned','Overdue')), borrower_email TEXT DEFAULT '', borrower_phone TEXT DEFAULT '', created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE RESTRICT, FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE RESTRICT);`);
  await db.query(`CREATE TABLE IF NOT EXISTS email_notifications (id SERIAL PRIMARY KEY, rental_id INTEGER NOT NULL, type TEXT NOT NULL CHECK(type IN ('reminder','overdue')), sent_at DATE NOT NULL DEFAULT CURRENT_DATE, FOREIGN KEY (rental_id) REFERENCES rentals(id) ON DELETE CASCADE);`);
  // Column migrations
  for (const [tbl, col, sql] of [
    ['members', 'is_deleted', `ALTER TABLE members ADD COLUMN is_deleted INTEGER DEFAULT 0`],
    ['members', 'status', `ALTER TABLE members ADD COLUMN status TEXT DEFAULT 'active'`],
    ['rentals', 'borrower_email', `ALTER TABLE rentals ADD COLUMN borrower_email TEXT DEFAULT ''`],
    ['rentals', 'borrower_phone', `ALTER TABLE rentals ADD COLUMN borrower_phone TEXT DEFAULT ''`],
  ]) {
    const r = await db.query(`SELECT column_name FROM information_schema.columns WHERE table_name=$1 AND column_name=$2`, [tbl, col]);
    if (r.rowCount === 0) await db.query(sql);
  }
  // Seed admin
  const adminUser = process.env.ADMIN_USERNAME || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD;
  if (adminPass) {
    const existing = await db.get('SELECT id FROM admins WHERE username=$1', [adminUser]);
    if (!existing) {
      const hash = await bcrypt.hash(adminPass, 10);
      await db.run('INSERT INTO admins (username, password_hash) VALUES ($1,$2)', [adminUser, hash]);
    }
  }
  console.log('[DB] Initialized.');
}

// ── Auth Middleware ─────────────────────────────────────────────────────────────
function authenticateAdmin(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'No token provided.' });
  try {
    req.admin = jwt.verify(auth.substring(7), process.env.JWT_SECRET || 'ieee_inventory_secret_jwt_key_2026_super_secure');
    next();
  } catch { return res.status(401).json({ error: 'Invalid or expired token.' }); }
}

function getTodayStr() { return new Date().toLocaleDateString('en-CA'); }

// ── Express App ─────────────────────────────────────────────────────────────────
const app = express();

app.use(cors({ origin: '*', methods: ['GET','POST','PUT','DELETE','OPTIONS','PATCH'], allowedHeaders: ['Content-Type','Authorization'] }));
app.use(express.json());

// Handle CORS preflight
app.options('*', cors());

// ── Health ──────────────────────────────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', service: 'IEEE Inventory API (Netlify)', timestamp: new Date().toISOString() }));

// ── Auth ────────────────────────────────────────────────────────────────────────
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
    const admin = await db.get('SELECT * FROM admins WHERE username=$1', [username]);
    if (!admin || !await bcrypt.compare(password, admin.password_hash)) return res.status(401).json({ error: 'Invalid credentials.' });
    const token = jwt.sign({ id: admin.id, username: admin.username }, process.env.JWT_SECRET || 'ieee_inventory_secret_jwt_key_2026_super_secure', { expiresIn: '24h' });
    return res.json({ message: 'Login successful', token, admin: { id: admin.id, username: admin.username } });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/auth/me', authenticateAdmin, (req, res) => res.json({ admin: req.admin }));

// ── Items ────────────────────────────────────────────────────────────────────────
app.get('/api/items/categories', async (_, res) => {
  try { return res.json((await db.all('SELECT DISTINCT category FROM items ORDER BY category ASC')).map(c => c.category)); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

const upload = multer({ limits: { fileSize: 10 * 1024 * 1024 } });
app.get('/api/items/sample-template', authenticateAdmin, (_, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet([{ 'Component Name': 'Arduino Uno R3', 'Category': 'Microcontrollers', 'Quantity': 10, 'Description': 'ATmega328P board' }]);
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Items');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="IEEE_Inventory_Template.xlsx"');
    return res.send(buffer);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.post('/api/items/bulk-import', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' });
    const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: '' });
    if (!rows.length) return res.status(400).json({ error: 'File has no data.' });
    let added = 0, updated = 0, failed = 0;
    for (const row of rows) {
      const name = String(row['Component Name'] || row['name'] || '').trim();
      const category = String(row['Category'] || row['category'] || '').trim();
      const qty = parseInt(row['Quantity'] || row['total_qty'] || 0);
      const desc = String(row['Description'] || row['description'] || '').trim();
      if (!name || !category || isNaN(qty)) { failed++; continue; }
      const ex = await db.get('SELECT id FROM items WHERE LOWER(name)=LOWER($1)', [name]);
      if (ex) { await db.run('UPDATE items SET category=$1,total_qty=$2,available_qty=$3,description=$4 WHERE id=$5', [category, qty, qty, desc, ex.id]); updated++; }
      else { await db.run('INSERT INTO items (name,description,category,total_qty,available_qty) VALUES ($1,$2,$3,$4,$5)', [name, desc, category, qty, qty]); added++; }
    }
    return res.json({ message: 'Import complete.', added, updated, failed, total: rows.length });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/items', async (req, res) => {
  try {
    const { search, category } = req.query;
    let query = 'SELECT * FROM items WHERE 1=1'; const params = []; let i = 1;
    if (search) { query += ` AND (name ILIKE $${i} OR description ILIKE $${i+1})`; params.push(`%${search}%`, `%${search}%`); i += 2; }
    if (category && category !== 'All') { query += ` AND category=$${i}`; params.push(category); i++; }
    query += ' ORDER BY name ASC';
    return res.json((await db.all(query, params)).map(item => ({ ...item, status: item.available_qty > 0 ? 'In Stock' : 'Out of Stock' })));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/items/:id', async (req, res) => {
  try {
    const item = await db.get('SELECT * FROM items WHERE id=$1', [req.params.id]);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    return res.json({ ...item, status: item.available_qty > 0 ? 'In Stock' : 'Out of Stock' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.post('/api/items', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, category, total_qty, available_qty } = req.body;
    if (!name || !category || total_qty == null || available_qty == null) return res.status(400).json({ error: 'name, category, total_qty, available_qty required.' });
    const result = await db.run('INSERT INTO items (name,description,category,total_qty,available_qty) VALUES ($1,$2,$3,$4,$5) RETURNING id', [name, description||'', category, total_qty, available_qty]);
    return res.status(201).json(await db.get('SELECT * FROM items WHERE id=$1', [result.rows[0].id]));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.put('/api/items/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, category, total_qty, available_qty } = req.body;
    const r = await db.run('UPDATE items SET name=$1,description=$2,category=$3,total_qty=$4,available_qty=$5 WHERE id=$6', [name, description||'', category, total_qty, available_qty, req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Item not found.' });
    return res.json(await db.get('SELECT * FROM items WHERE id=$1', [req.params.id]));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.delete('/api/items/:id', authenticateAdmin, async (req, res) => {
  try {
    const active = await db.get('SELECT COUNT(*) as count FROM rentals WHERE item_id=$1 AND date_returned IS NULL', [req.params.id]);
    if (parseInt(active.count) > 0) return res.status(400).json({ error: 'Cannot delete item with active rentals.' });
    const r = await db.run('DELETE FROM items WHERE id=$1', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Item not found.' });
    return res.json({ message: 'Item deleted.' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── Members ─────────────────────────────────────────────────────────────────────
app.get('/api/members/verify/:membership_id', async (req, res) => {
  try {
    const member = await db.get('SELECT id,membership_id,name,email,department,status,is_deleted FROM members WHERE LOWER(membership_id)=LOWER($1)', [req.params.membership_id.trim()]);
    if (!member || member.is_deleted) return res.json({ valid: false, status: 'not_found', message: 'Membership not found or inactive.' });
    if ((member.status||'active').toLowerCase() !== 'active') return res.json({ valid: false, status: 'inactive', message: 'Membership inactive.', member });
    return res.json({ valid: true, status: 'active', message: 'Verified IEEE Member', member });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.get('/api/members/sample-template', authenticateAdmin, (_, res) => {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet([{ 'Membership ID': 'IEEE-2001', 'Full Name': 'Sarah Connor', 'Email': 'sarah@uni.edu', 'Phone': '+1-555-0100', 'Department': 'EEE', 'Status': 'active' }]);
  XLSX.utils.book_append_sheet(wb, ws, 'Members');
  const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="IEEE_Members_Template.xlsx"');
  return res.send(buffer);
});
app.use('/api/members', authenticateAdmin);
app.get('/api/members', async (req, res) => {
  try {
    const { search, status } = req.query;
    let query = 'SELECT * FROM members WHERE is_deleted=0'; const params = []; let i = 1;
    if (search) { query += ` AND (name ILIKE $${i} OR membership_id ILIKE $${i+1} OR email ILIKE $${i+2})`; params.push(`%${search}%`, `%${search}%`, `%${search}%`); i += 3; }
    if (status && status !== 'All') { query += ` AND status=$${i}`; params.push(status); i++; }
    return res.json(await db.all(query + ' ORDER BY name ASC', params));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.post('/api/members', async (req, res) => {
  try {
    const { membership_id, name, email, phone, department, status } = req.body;
    if (!membership_id || !name || !email || !department) return res.status(400).json({ error: 'membership_id, name, email, department required.' });
    const result = await db.run('INSERT INTO members (membership_id,name,email,phone,department,status,is_deleted) VALUES ($1,$2,$3,$4,$5,$6,0) RETURNING id', [membership_id, name, email, phone||'', department, status||'active']);
    return res.status(201).json(await db.get('SELECT * FROM members WHERE id=$1', [result.rows[0].id]));
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Membership ID already exists.' });
    return res.status(500).json({ error: err.message });
  }
});
app.put('/api/members/:id', async (req, res) => {
  try {
    const { membership_id, name, email, phone, department, status } = req.body;
    const r = await db.run('UPDATE members SET membership_id=$1,name=$2,email=$3,phone=$4,department=$5,status=$6 WHERE id=$7 AND is_deleted=0', [membership_id, name, email, phone||'', department, status||'active', req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Member not found.' });
    return res.json(await db.get('SELECT * FROM members WHERE id=$1', [req.params.id]));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.delete('/api/members/:id', async (req, res) => {
  try {
    const active = await db.get('SELECT COUNT(*) as count FROM rentals WHERE member_id=$1 AND date_returned IS NULL', [req.params.id]);
    if (parseInt(active.count) > 0) return res.status(400).json({ error: 'Cannot delete member with active rentals.' });
    const r = await db.run('UPDATE members SET is_deleted=1 WHERE id=$1 AND is_deleted=0', [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Member not found.' });
    return res.json({ message: 'Member deleted.' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── Rentals ─────────────────────────────────────────────────────────────────────
app.use('/api/rentals', authenticateAdmin);
app.get('/api/rentals', async (req, res) => {
  try {
    const { status, member_id, item_id, search } = req.query;
    const todayStr = getTodayStr();
    await db.run(`UPDATE rentals SET status='Overdue' WHERE date_returned IS NULL AND return_due_date < $1 AND status != 'Overdue'`, [todayStr]);
    let query = `SELECT r.id, r.item_id, r.member_id, r.quantity, r.status, r.date_taken::text as date_taken, r.return_due_date::text as return_due_date, r.date_returned::text as date_returned, r.borrower_email, r.borrower_phone, r.created_at, i.name as item_name, i.category as item_category, i.available_qty as current_item_stock, m.membership_id, m.name as member_name, m.status as member_status, r.borrower_email as member_email, r.borrower_phone as member_phone FROM rentals r JOIN items i ON r.item_id=i.id JOIN members m ON r.member_id=m.id WHERE 1=1`;
    const params = []; let i = 1;
    if (status && status !== 'All') {
      if (status === 'Overdue') { query += ` AND (r.status='Overdue' OR (r.date_returned IS NULL AND r.return_due_date < $${i}))`; params.push(todayStr); i++; }
      else { query += ` AND r.status=$${i}`; params.push(status); i++; }
    }
    if (member_id) { query += ` AND r.member_id=$${i}`; params.push(member_id); i++; }
    if (item_id) { query += ` AND r.item_id=$${i}`; params.push(item_id); i++; }
    if (search) { query += ` AND (i.name ILIKE $${i} OR m.name ILIKE $${i+1} OR m.membership_id ILIKE $${i+2})`; const s = `%${search}%`; params.push(s, s, s); i += 3; }
    const rentals = await db.all(query + ' ORDER BY r.created_at DESC', params);
    return res.json({ rentals, stats: { total: rentals.length, active: rentals.filter(r => r.status==='Active').length, overdue: rentals.filter(r => r.status==='Overdue').length, returned: rentals.filter(r => r.status==='Returned').length } });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.post('/api/rentals', async (req, res) => {
  try {
    const { item_id, member_id, quantity, date_taken, return_due_date, borrower_email, borrower_phone } = req.body;
    if (!item_id || !member_id || !quantity || !date_taken || !return_due_date) return res.status(400).json({ error: 'item_id, member_id, quantity, date_taken, return_due_date required.' });
    const item = await db.get('SELECT * FROM items WHERE id=$1', [item_id]);
    if (!item) return res.status(404).json({ error: 'Item not found.' });
    if (item.available_qty < quantity) return res.status(400).json({ error: `Insufficient stock. Available: ${item.available_qty}` });
    const result = await db.transaction(async (client) => {
      const r = await client.query('INSERT INTO rentals (item_id,member_id,quantity,date_taken,return_due_date,status,borrower_email,borrower_phone) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [item_id, member_id, quantity, date_taken, return_due_date, 'Active', borrower_email||'', borrower_phone||'']);
      await client.query('UPDATE items SET available_qty=available_qty-$1 WHERE id=$2', [quantity, item_id]);
      return r.rows[0];
    });
    return res.status(201).json(await db.get('SELECT r.*, i.name as item_name, m.name as member_name FROM rentals r JOIN items i ON r.item_id=i.id JOIN members m ON r.member_id=m.id WHERE r.id=$1', [result.id]));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.put('/api/rentals/:id/return', async (req, res) => {
  try {
    const rental = await db.get('SELECT * FROM rentals WHERE id=$1', [req.params.id]);
    if (!rental) return res.status(404).json({ error: 'Rental not found.' });
    if (rental.date_returned) return res.status(400).json({ error: 'Already returned.' });
    const returnDate = req.body.date_returned || getTodayStr();
    await db.transaction(async (client) => {
      await client.query(`UPDATE rentals SET date_returned=$1, status='Returned' WHERE id=$2`, [returnDate, req.params.id]);
      await client.query('UPDATE items SET available_qty=available_qty+$1 WHERE id=$2', [rental.quantity, rental.item_id]);
    });
    return res.json({ message: 'Returned successfully.', rental_id: parseInt(req.params.id), date_returned: returnDate });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});
app.delete('/api/rentals/:id', async (req, res) => {
  try {
    const rental = await db.get('SELECT * FROM rentals WHERE id=$1', [req.params.id]);
    if (!rental) return res.status(404).json({ error: 'Rental not found.' });
    if (!rental.date_returned) await db.run('UPDATE items SET available_qty=available_qty+$1 WHERE id=$2', [rental.quantity, rental.item_id]);
    await db.run('DELETE FROM rentals WHERE id=$1', [req.params.id]);
    return res.json({ message: 'Rental deleted.' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// 404 & error handlers
app.use((req, res) => res.status(404).json({ error: 'Route not found', path: req.url }));
app.use((err, req, res, next) => { console.error('[API]', err); res.status(500).json({ error: err.message || 'Internal Server Error' }); });

// ── Initialize DB on cold start ─────────────────────────────────────────────────
let isDbReady = false;

const wrappedApp = async (event, context) => {
  if (!isDbReady) {
    try {
      await initDb();
      isDbReady = true;
    } catch (err) {
      console.error('[API] DB init failed:', err.message);
      return {
        statusCode: 500,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Database connection failed', message: err.message, hint: 'Set DATABASE_URL in Netlify → Site Settings → Environment Variables.' })
      };
    }
  }
  return serverlessHttp(app)(event, context);
};

export { wrappedApp as handler };
