/**
 * scripts/test-login-auth.js
 * Diagnostic script to test the complete Auth/Login flow end-to-end.
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE = 'http://localhost:5000/api';

async function testAuthFlow() {
  console.log('==================================================');
  console.log('🔍 TESTING LOGIN & AUTH FLOW');
  console.log('==================================================\n');

  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) throw new Error('ADMIN_PASSWORD is required.');
  // 1. Attempt login with correct credentials
  console.log(`1. Testing POST /api/auth/login with credentials: { username: "admin", password: "${adminPassword}" }`);
  try {
    const loginRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: adminPassword })
    });

    console.log(`   HTTP Status: ${loginRes.status}`);
    const loginData = await loginRes.json();
    console.log('   Response Data:', loginData);

    if (loginRes.ok && loginData.token) {
      console.log('   ✅ Login API call successful! Token received.\n');

      // 2. Verify token with GET /api/auth/me
      console.log('2. Testing GET /api/auth/me with Bearer token...');
      const meRes = await fetch(`${BASE}/auth/me`, {
        headers: { Authorization: `Bearer ${loginData.token}` }
      });

      console.log(`   HTTP Status: ${meRes.status}`);
      const meData = await meRes.json();
      console.log('   Response Data:', meData);

      if (meRes.ok && meData.admin) {
        console.log('   ✅ GET /api/auth/me successful! Admin object verified.\n');
      } else {
        console.log('   ❌ GET /api/auth/me FAILED!\n');
      }
    } else {
      console.log('   ❌ Login API FAILED!\n');
    }
  } catch (err) {
    console.error('   💥 Network/Server Error during login test:', err.message);
  }

  // 3. Test invalid credentials
  console.log('3. Testing POST /api/auth/login with wrong password...');
  try {
    const wrongRes = await fetch(`${BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    console.log(`   HTTP Status: ${wrongRes.status}`);
    const wrongData = await wrongRes.json();
    console.log('   Response Data:', wrongData);
    if (wrongRes.status === 401) {
      console.log('   ✅ Correctly rejected invalid credentials with 401.\n');
    }
  } catch (err) {
    console.error('   💥 Error:', err.message);
  }

  console.log('==================================================');
  console.log('DIAGNOSTIC TEST COMPLETE');
  console.log('==================================================');
}

testAuthFlow();
