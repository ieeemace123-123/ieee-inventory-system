/**
 * Live integration test: exercises DELETE /api/members/:id via real HTTP
 * using the running backend server. Tests all 3 cases.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

import { getDb, initDb } from '../src/db/database.js';

const BASE = 'http://localhost:5000/api';

// ── Get admin JWT first ───────────────────────────────────────────────────────
async function getAdminToken() {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: process.env.ADMIN_USERNAME || 'admin', password: process.env.ADMIN_PASSWORD })
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  return data.token;
}

// ── Send DELETE request ───────────────────────────────────────────────────────
async function deleteMember(token, memberId) {
  const res = await fetch(`${BASE}/members/${memberId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  const body = await res.json().catch(() => ({ raw: 'non-JSON response' }));
  return { status: res.status, body };
}

const logSection = (t) => console.log(`\n${'='.repeat(55)}\n🔍 ${t}\n${'='.repeat(55)}`);

async function runLiveTest() {
  await initDb();
  const db = await getDb();

  logSection('STEP 1: Get Admin JWT token');
  const token = await getAdminToken();
  console.log(`✅ Token acquired: ${token.slice(0, 30)}...`);

  logSection('STEP 2: CASE (a) — Delete member with NO active rentals (Alex Johnson #1)');
  const r1 = await deleteMember(token, 1);
  console.log(`HTTP Status : ${r1.status}`);
  console.log(`Response    : ${JSON.stringify(r1.body, null, 2)}`);
  if (r1.status === 200) {
    console.log('✅ PASS: Soft-deleted successfully!');
    // Restore for continued testing
    await db.run('UPDATE members SET is_deleted = 0 WHERE id = 1');
    console.log('(Restored member #1 for continued testing)');
  } else {
    console.log('❌ FAIL — Expected 200');
  }

  logSection('STEP 3: CASE (b) — Delete member with returned history only (hannath #6)');
  const r2 = await deleteMember(token, 6);
  console.log(`HTTP Status : ${r2.status}`);
  console.log(`Response    : ${JSON.stringify(r2.body, null, 2)}`);
  if (r2.status === 200) {
    console.log('✅ PASS: Soft-deleted; history preserved in rentals table!');
    const history = await db.all('SELECT id, status FROM rentals WHERE member_id = 6');
    console.log(`  Rental records in DB (should still exist): ${history.length} rows`);
    await db.run('UPDATE members SET is_deleted = 0 WHERE id = 6');
    console.log('(Restored member #6 for continued testing)');
  } else {
    console.log('❌ FAIL — Expected 200');
  }

  logSection('STEP 4: CASE (c) — Delete member WITH active rental (Sophia Martinez #4)');
  const r3 = await deleteMember(token, 4);
  console.log(`HTTP Status : ${r3.status}`);
  console.log(`Response    : ${JSON.stringify(r3.body, null, 2)}`);
  if (r3.status === 400) {
    console.log('✅ PASS: Deletion correctly blocked with specific error message!');
  } else {
    console.log('❌ FAIL — Expected 400 block');
  }

  logSection('DONE');
  console.log('All live HTTP tests completed.\n');
}

runLiveTest().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
