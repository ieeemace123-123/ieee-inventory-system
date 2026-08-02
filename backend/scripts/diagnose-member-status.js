import { getDb } from '../src/db/database.js';

const db = await getDb();

console.log('\n=== ALL RENTALS IN DATABASE ===');
const rentals = await db.all(`
  SELECT r.id, r.member_id, m.name as member_name, i.name as item_name,
         r.date_returned, r.status, r.return_due_date
  FROM rentals r
  JOIN members m ON r.member_id = m.id
  JOIN items i ON r.item_id = i.id
  ORDER BY r.member_id, r.id
`);

if (rentals.length === 0) {
  console.log('  (no rentals found in DB)');
} else {
  rentals.forEach(r => {
    const returned = r.date_returned !== null ? `✅ Returned (${r.date_returned})` : `🔴 NOT returned`;
    console.log(`  Rental #${r.id} | Member: "${r.member_name}" | Item: "${r.item_name}" | Status: ${r.status} | date_returned: ${returned}`);
  });
}

console.log('\n=== MEMBER ACTIVE_RENTALS_COUNT (live query result) ===');
const counts = await db.all(`
  SELECT m.id, m.name, m.membership_id,
         COUNT(CASE WHEN r.id IS NOT NULL AND r.date_returned IS NULL THEN 1 END) as active_rentals_count,
         COUNT(r.id) as total_rentals_count
  FROM members m
  LEFT JOIN rentals r ON m.id = r.member_id
  WHERE (m.is_deleted IS NULL OR m.is_deleted = 0)
  GROUP BY m.id
  ORDER BY m.id
`);

counts.forEach(m => {
  const statusLabel = m.active_rentals_count > 0 ? '🟡 SHOWS ACTIVE' : '✅ SHOWS INACTIVE';
  console.log(`  Member #${m.id} "${m.name}" | active_rentals_count=${m.active_rentals_count} | total_rentals=${m.total_rentals_count} → ${statusLabel}`);
});

console.log('\n=== DIAGNOSIS ===');
console.log('The query uses: COUNT(CASE WHEN r.date_returned IS NULL THEN 1 END)');
console.log('This means: a member is "Active" ONLY if they have a rental where date_returned IS NULL.');
console.log('If ALL their rentals have date_returned set → they will correctly show 0 Active.');
console.log('\nIf a member still shows active_rentals_count > 0 after all returns are done,');
console.log('it means the return action did NOT set date_returned (only set status="Returned").');
console.log('Check: does any rental have status="Returned" but date_returned=NULL?');

const mismatch = await db.all(`
  SELECT id, member_id, status, date_returned
  FROM rentals
  WHERE status = 'Returned' AND date_returned IS NULL
`);

if (mismatch.length > 0) {
  console.log('\n🐛 BUG CONFIRMED — Rentals with status=Returned but date_returned=NULL:');
  mismatch.forEach(r => console.log(`  Rental #${r.id} | member_id=${r.member_id} | status="${r.status}" | date_returned=${r.date_returned}`));
} else {
  console.log('\n✅ No status/date_returned mismatch found.');
}

process.exit(0);
