import { getDb } from '../src/db/database.js';

const db = await getDb();

console.log('=== ITEMS WITH ANY RENTAL RECORDS (including returned history) ===');
const rows = await db.all(`
  SELECT i.id as item_id, i.name as item_name,
         r.id as rental_id, r.status, r.date_returned
  FROM items i
  LEFT JOIN rentals r ON r.item_id = i.id
  ORDER BY i.id, r.id
`);
rows.forEach(r => {
  if (r.rental_id !== null) {
    console.log(`  Item #${r.item_id} "${r.item_name}" → Rental #${r.rental_id} | status="${r.status}" | date_returned=${r.date_returned ?? 'NULL'}`);
  } else {
    console.log(`  Item #${r.item_id} "${r.item_name}" → No rental records at all`);
  }
});

console.log('\n=== FOREIGN KEY ON rentals TABLE ===');
const fk = await db.all('PRAGMA foreign_key_list(rentals)');
fk.forEach(f => console.log(`  ${f.table}.${f.from} → ${f.to} | on_delete="${f.on_delete}"`));

console.log('\n=== FOREIGN KEYS ENFORCEMENT STATUS ===');
const fkEnabled = await db.get('PRAGMA foreign_keys');
console.log('  foreign_keys =', fkEnabled?.foreign_keys ?? 'unknown');

console.log('\n=== DIAGNOSIS ===');
console.log('If rentals.on_delete = RESTRICT and any rental history (even Returned) exists,');
console.log('the DELETE FROM items will be blocked by SQLite foreign key constraint.');

process.exit(0);
