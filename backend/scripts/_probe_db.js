import { getDb, initDb } from '../src/db/database.js';

await initDb();
const db = await getDb();

// Check columns
const cols = await db.all('PRAGMA table_info(members)');
console.log('members columns:', cols.map(c => c.name));

// Check all members + rental counts
const members = await db.all(`
  SELECT m.id, m.membership_id, m.name,
         COUNT(CASE WHEN r.date_returned IS NULL THEN 1 END) as active_count,
         COUNT(r.id) as total_count
  FROM members m
  LEFT JOIN rentals r ON m.id = r.member_id
  GROUP BY m.id
`);
console.log('\nMembers + rental counts:');
members.forEach(m => {
  console.log(` - #${m.id} ${m.membership_id} | ${m.name} | active: ${m.active_count}, total: ${m.total_count}`);
});

// Simulate delete attempt on EACH member to find who'd fail and why
console.log('\nSimulating DELETE for each member:');
for (const m of members) {
  if (m.active_count > 0) {
    console.log(` - #${m.id} ${m.name}: ❌ BLOCKED — has ${m.active_count} unreturned rental(s)`);
  } else {
    console.log(` - #${m.id} ${m.name}: ✅ CAN be deleted (0 active rentals, ${m.total_count} total history rows)`);
  }
}
