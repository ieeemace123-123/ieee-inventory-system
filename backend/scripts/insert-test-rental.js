/**
 * scripts/insert-test-rental.js
 * Inserts a test overdue rental and a reminder rental, then triggers both
 * email checks directly (no HTTP server needed).
 * 
 * Run: node scripts/insert-test-rental.js
 * Remove test data after: node scripts/insert-test-rental.js --cleanup
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { getDb, initDb } from '../src/db/database.js';
import { triggerReminderCheck, triggerOverdueCheck } from '../src/services/cronService.js';

const cleanup = process.argv.includes('--cleanup');

async function run() {
  await initDb();
  const db = await getDb();

  if (cleanup) {
    await db.run("DELETE FROM rentals WHERE id IN (SELECT id FROM rentals WHERE quantity = 99)");
    console.log('Test rentals removed.');
    return;
  }

  // Find any member with a real email to test with
  const member = await db.get("SELECT * FROM members ORDER BY id DESC LIMIT 1");
  const item   = await db.get("SELECT * FROM items LIMIT 1");

  if (!member || !item) {
    console.error('No members or items found. Run npm start once to seed the DB.');
    return;
  }

  const today = new Date();
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 2);
  const tomorrow  = new Date(today); tomorrow.setDate(today.getDate() + 1);
  const weekAgo   = new Date(today); weekAgo.setDate(today.getDate() - 7);

  const overdueDate   = yesterday.toISOString().split('T')[0];
  const reminderDate  = tomorrow.toISOString().split('T')[0];
  const weekAgoStr    = weekAgo.toISOString().split('T')[0];

  // Insert overdue test rental (quantity=99 used as marker for cleanup)
  const r1 = await db.run(
    `INSERT INTO rentals (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status)
     VALUES (?, ?, 99, ?, ?, NULL, 'Active')`,
    [item.id, member.id, weekAgoStr, overdueDate]
  );
  console.log(`Inserted TEST OVERDUE rental #${r1.lastID} | Member: ${member.name} (${member.email}) | Due: ${overdueDate}`);

  // Insert reminder test rental (due tomorrow)
  const r2 = await db.run(
    `INSERT INTO rentals (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status)
     VALUES (?, ?, 99, ?, ?, NULL, 'Active')`,
    [item.id, member.id, weekAgoStr, reminderDate]
  );
  console.log(`Inserted TEST REMINDER rental #${r2.lastID} | Member: ${member.name} (${member.email}) | Due: ${reminderDate}`);

  console.log('\n--- Triggering reminder check ---');
  const reminderResult = await triggerReminderCheck();
  console.log('Reminder result:', JSON.stringify(reminderResult, null, 2));

  console.log('\n--- Triggering overdue check ---');
  const overdueResult = await triggerOverdueCheck();
  console.log('Overdue result:', JSON.stringify(overdueResult, null, 2));

  console.log('\nDone. Run with --cleanup to remove test rentals.');
}

run().catch(err => { console.error('Error:', err); process.exit(1); });
