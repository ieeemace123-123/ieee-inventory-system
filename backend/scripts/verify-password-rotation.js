// Verification script — confirms new password works and old password is rejected
import dotenv from 'dotenv';
dotenv.config();

const newPass = process.env.ADMIN_PASSWORD;
const oldPass = process.env.OLD_ADMIN_PASSWORD;

async function verify() {
  // Test new password
  const res = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: newPass })
  });
  const data = await res.json();
  console.log('New password login:', res.status === 200 && data.token ? 'SUCCESS (accepted)' : 'FAILED - ' + JSON.stringify(data));

  // Test old password should be rejected
  const old = await fetch('http://localhost:5000/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: oldPass })
  });
  console.log('Old password:', old.status === 401 ? 'CORRECTLY REJECTED (401 Unauthorized)' : 'SECURITY WARNING - old password still accepted!');
}

verify();
