import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbClient } from '../src/db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const username = process.env.ADMIN_USERNAME || 'admin';
const password = process.env.ADMIN_PASSWORD || 'inventory46@64';

async function syncPassword() {
  console.log(`Setting password for admin user "${username}" to: "${password}"...`);
  const db = getDbClient();
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(password, salt);

  await db.query('UPDATE admins SET password_hash = $1 WHERE username = $2', [hash, username]);
  console.log('✅ Admin password successfully updated in database!');

  const row = await db.get('SELECT * FROM admins WHERE username = $1', [username]);
  const isMatch = await bcrypt.compare(password, row.password_hash);
  console.log('✅ Password verification test:', isMatch ? 'PASSED' : 'FAILED');
  process.exit(0);
}

syncPassword().catch(err => {
  console.error('Error syncing admin password:', err);
  process.exit(1);
});

