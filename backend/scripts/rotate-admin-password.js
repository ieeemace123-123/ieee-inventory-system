// Password rotation script — updates the admin password hash directly in the live database.
// Run with: node scripts/rotate-admin-password.js
import bcrypt from 'bcryptjs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { getDbClient } from '../src/db/database.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../.env') });

const newPassword = process.env.ADMIN_PASSWORD;
const adminUsername = process.env.ADMIN_USERNAME || 'admin';

if (!newPassword) {
  console.error('ERROR: ADMIN_PASSWORD is not set in .env');
  process.exit(1);
}

console.log(`Rotating password for admin user: "${adminUsername}"...`);

async function rotate() {
  const db = getDbClient();
  const salt = await bcrypt.genSalt(12);
  const hash = await bcrypt.hash(newPassword, salt);

  const result = await db.query(
    'UPDATE admins SET password_hash = $1 WHERE username = $2',
    [hash, adminUsername]
  );

  if (result.rowCount === 0) {
    console.error(`No admin row found with username "${adminUsername}". Check ADMIN_USERNAME in .env`);
    process.exit(1);
  } else {
    console.log('Admin password hash rotated successfully in the live database.');
    console.log(`Rows updated: ${result.rowCount}`);
  }
  process.exit(0);
}

rotate().catch(err => {
  console.error('Error rotating admin password:', err);
  process.exit(1);
});

