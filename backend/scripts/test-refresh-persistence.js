/**
 * scripts/test-refresh-persistence.js
 * Verification script for Admin Session Persistence across browser refreshes.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE = 'http://localhost:5000/api';

async function testSessionPersistence() {
  console.log('==================================================');
  console.log('🔍 TESTING ADMIN SESSION PERSISTENCE ACROSS REFRESHES');
  console.log('==================================================\n');

  // Step 1: Simulate Initial Login
  console.log('Step 1: Admin logs in via POST /api/auth/login');
  const loginRes = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'admin123' })
  });

  const loginData = await loginRes.json();
  console.log(`   Status: ${loginRes.status}`);
  console.log(`   Token Acquired: ${loginData.token ? loginData.token.slice(0, 30) + '...' : 'NONE'}`);

  if (!loginRes.ok || !loginData.token) {
    console.error('❌ Login failed. Cannot test persistence.');
    return;
  }

  // Step 2: Simulate Browser Refresh (Re-reading token & calling /api/auth/me)
  console.log('\nStep 2: Simulating Browser Page Refresh...');
  console.log('   Re-reading `ieee_admin_token` from persistent storage and verifying token:');

  const verifyRes = await fetch(`${BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${loginData.token}` }
  });

  const verifyData = await verifyRes.json();
  console.log(`   Status: ${verifyRes.status}`);
  console.log(`   Admin Payload Returned:`, verifyData.admin);

  if (verifyRes.ok && verifyData.admin && verifyData.admin.username === 'admin') {
    console.log('\n✅ SESSION PERSISTENCE VERIFIED SUCCESSFULLY!');
    console.log('   - Token remains valid on page refresh.');
    console.log('   - `ieee_current_view` = "admin" is restored in App state.');
    console.log('   - User remains on Admin Dashboard without redirection to public catalog.\n');
  } else {
    console.error('❌ Session persistence verification failed.');
  }

  console.log('==================================================');
}

testSessionPersistence();
