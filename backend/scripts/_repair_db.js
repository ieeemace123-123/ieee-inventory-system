/**
 * One-time DB repair: fix state left by old hard-delete code running on Sophia Martinez (#4)
 * - Sophia was hard-deleted from members but her active rental row may still exist in rentals
 * - Also re-inserts Sophia and David Kim if missing so seed members are complete
 */
import { getDb, initDb } from '../src/db/database.js';

await initDb();
const db = await getDb();

console.log('--- Repairing DB after old hard-delete ---');

// 1. Check for orphaned rentals (member_id references no existing member)
const orphaned = await db.all(`
  SELECT r.id, r.member_id, r.status, r.date_returned
  FROM rentals r
  LEFT JOIN members m ON r.member_id = m.id
  WHERE m.id IS NULL
`);
console.log(`Orphaned rental rows (no parent member): ${orphaned.length}`);
if (orphaned.length > 0) {
  console.log('Orphaned rentals:', orphaned);
  // Clean up orphaned rentals (their member was hard-deleted)
  for (const r of orphaned) {
    await db.run(`DELETE FROM email_notifications WHERE rental_id = ?`, [r.id]);
    await db.run(`DELETE FROM rentals WHERE id = ?`, [r.id]);
    console.log(`  Deleted orphaned rental #${r.id} (member_id=${r.member_id})`);
  }
}

// 2. Re-insert Sophia (#4) and David (#5) if they were hard-deleted
const sophia = await db.get(`SELECT id FROM members WHERE membership_id = 'IEEE-1004'`);
if (!sophia) {
  await db.run(
    `INSERT INTO members (membership_id, name, email, phone, department, is_deleted) VALUES (?, ?, ?, ?, ?, 0)`,
    ['IEEE-1004', 'Sophia Martinez', 'sophia.m@university.edu', '+1-555-0162', 'Electronics & Comm.']
  );
  console.log('Re-inserted Sophia Martinez (IEEE-1004)');
} else {
  console.log(`Sophia Martinez exists (id=${sophia.id})`);
}

const david = await db.get(`SELECT id FROM members WHERE membership_id = 'IEEE-1005'`);
if (!david) {
  await db.run(
    `INSERT INTO members (membership_id, name, email, phone, department, is_deleted) VALUES (?, ?, ?, ?, ?, 0)`,
    ['IEEE-1005', 'David Kim', 'david.k@university.edu', '+1-555-0111', 'Biomedical Engineering']
  );
  console.log('Re-inserted David Kim (IEEE-1005)');
} else {
  console.log(`David Kim exists (id=${david.id})`);
}

// 3. Show final state
const members = await db.all(`SELECT id, membership_id, name, is_deleted FROM members ORDER BY id`);
console.log('\nFinal members table:');
members.forEach(m => console.log(` - #${m.id} ${m.membership_id} | ${m.name} | is_deleted=${m.is_deleted}`));

const rentals = await db.all(`SELECT id, member_id, status, date_returned FROM rentals ORDER BY id`);
console.log('\nAll rentals:');
rentals.forEach(r => console.log(` - Rental #${r.id} | member_id=${r.member_id} | status=${r.status} | returned=${r.date_returned}`));

console.log('\nDB repair complete.');
