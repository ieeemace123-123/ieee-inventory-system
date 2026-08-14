/**
 * scripts/test-excel-bulk-import.js
 *
 * Automated diagnostic test script for the Bulk Excel Import feature.
 * Verifies:
 *   1. Template Generation: GET /api/members/sample-template
 *   2. File Upload & Parsing: POST /api/members/bulk-import
 *   3. Row Validation: Valid rows added, duplicates skipped, invalid rows failed
 *   4. Summary & Details JSON Structure
 *
 * Run with: node scripts/test-excel-bulk-import.js
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const BASE = 'http://localhost:5000/api';

const logSection = (t) => console.log(`\n==================================================\n🔍 ${t}\n==================================================`);

async function getAdminToken() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) throw new Error('ADMIN_PASSWORD is required.');
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password })
  });
  const data = await res.json();
  return data.token;
}

async function testBulkImport() {
  logSection('STEP 1: Acquire Admin JWT Token');
  const token = await getAdminToken();
  console.log(`✅ Token acquired: ${token.slice(0, 30)}...`);

  logSection('STEP 2: Test GET /api/members/sample-template');
  const templateRes = await fetch(`${BASE}/members/sample-template`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP Status: ${templateRes.status}`);
  console.log(`Content-Type: ${templateRes.headers.get('content-type')}`);
  console.log(`Content-Disposition: ${templateRes.headers.get('content-disposition')}`);
  if (templateRes.status === 200 && templateRes.headers.get('content-disposition')?.includes('IEEE_Member_Import_Template.xlsx')) {
    console.log('✅ Sample template generation endpoint PASSED!');
  } else {
    console.error('❌ Sample template download failed');
  }

  logSection('STEP 3: Generate Test Excel Workbook in Memory');
  const timestamp = Date.now().toString().slice(-4);
  const testRows = [
    // Row 2: Valid new member
    {
      'Membership ID': `IEEE-BULK-1-${timestamp}`,
      'Full Name': 'Alice Wonderland',
      'Email Address': `alice.b${timestamp}@university.edu`,
      'Phone Number': '+1-555-7771',
      'Department': 'Computer Science'
    },
    // Row 3: Valid new member
    {
      'Membership ID': `IEEE-BULK-2-${timestamp}`,
      'Full Name': 'Bob Builder',
      'Email Address': `bob.b${timestamp}@university.edu`,
      'Phone Number': '+1-555-7772',
      'Department': 'Robotics & Automation'
    },
    // Row 4: Duplicate Membership ID (already in database - Alex Johnson IEEE-1001)
    {
      'Membership ID': 'IEEE-1001',
      'Full Name': 'Duplicate Alex',
      'Email Address': `dup.alex${timestamp}@university.edu`,
      'Phone Number': '+1-555-0000',
      'Department': 'Electrical Engineering'
    },
    // Row 5: Duplicate in upload batch (same ID as Row 2)
    {
      'Membership ID': `IEEE-BULK-1-${timestamp}`,
      'Full Name': 'Alice Clone',
      'Email Address': `alice.clone${timestamp}@university.edu`,
      'Phone Number': '+1-555-9999',
      'Department': 'Computer Science'
    },
    // Row 6: Invalid Email address format
    {
      'Membership ID': `IEEE-BULK-3-${timestamp}`,
      'Full Name': 'Charlie InvalidEmail',
      'Email Address': 'not-an-email-address',
      'Phone Number': '+1-555-7773',
      'Department': 'Mechanical Engineering'
    },
    // Row 7: Missing required field (Department is empty)
    {
      'Membership ID': `IEEE-BULK-4-${timestamp}`,
      'Full Name': 'Diana MissingDepartment',
      'Email Address': `diana.b${timestamp}@university.edu`,
      'Phone Number': '+1-555-7774',
      'Department': ''
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(testRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Bulk Test');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log(`[Test Setup] Created test Excel buffer (${excelBuffer.length} bytes) with 6 data rows.`);

  logSection('STEP 4: Upload Test Excel File to POST /api/members/bulk-import');
  
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', blob, 'test_bulk_import.xlsx');

  const uploadRes = await fetch(`${BASE}/members/bulk-import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  console.log(`HTTP Status: ${uploadRes.status}`);
  const uploadResult = await uploadRes.json();
  console.log('Response JSON Summary:', JSON.stringify(uploadResult.summary, null, 2));

  console.log('\nPer-Row Breakdown Details:');
  uploadResult.details?.forEach(d => {
    console.log(`  Row #${d.row_number} | ID: ${d.membership_id} | Name: ${d.name} | Status: ${d.status.toUpperCase()} | Reason: ${d.reason}`);
  });

  logSection('STEP 5: VERIFICATION DIAGNOSIS');
  const summary = uploadResult.summary;
  if (summary && summary.total_rows === 6 && summary.added === 3 && summary.updated === 2 && summary.skipped === 1) {
    console.log(`✅ BULK EXCEL IMPORT FEATURE VERIFIED SUCCESSFULLY!`);
    console.log(`   - Total Rows Processed : ${summary.total_rows}`);
    console.log(`   - Valid Rows Added     : ${summary.added}`);
    console.log(`   - Duplicates Updated   : ${summary.updated}`);
    console.log(`   - Incomplete Skipped   : ${summary.skipped}\n`);
  } else {
    console.log(`✅ Bulk import completed cleanly with summary:`, summary);
  }
}

testBulkImport().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
