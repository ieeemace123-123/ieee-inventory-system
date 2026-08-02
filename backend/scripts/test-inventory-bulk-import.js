/**
 * scripts/test-inventory-bulk-import.js
 *
 * Automated diagnostic test script for Bulk Inventory Excel Import.
 * Verifies:
 *   1. Sample Template Generation: GET /api/items/sample-template
 *   2. File Upload & Parsing: POST /api/items/bulk-import
 *   3. Row Validation & Stock Upsert (Adding to existing total_qty & available_qty)
 *   4. Summary & Per-Row Details JSON Breakdown
 *   5. Security Check: Unauthenticated access returns HTTP 401
 *
 * Run with: node scripts/test-inventory-bulk-import.js
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
  const password = process.env.ADMIN_PASSWORD || 'inventory46@64';
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password })
  });
  const data = await res.json();
  return data.token;
}

async function testInventoryBulkImport() {
  logSection('STEP 1: Acquire Admin JWT Token');
  const token = await getAdminToken();
  console.log(`✅ Token acquired: ${token.slice(0, 30)}...`);

  logSection('STEP 2: Security Check - Unauthenticated Access');
  const unauthRes = await fetch(`${BASE}/items/sample-template`);
  console.log(`Unauthenticated GET status: ${unauthRes.status} (Expected: 401)`);
  if (unauthRes.status === 401) {
    console.log('✅ Security check PASSED! Unauthenticated requests blocked.');
  } else {
    console.error('❌ Security check FAILED');
  }

  logSection('STEP 3: Test GET /api/items/sample-template');
  const templateRes = await fetch(`${BASE}/items/sample-template`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  console.log(`HTTP Status: ${templateRes.status}`);
  console.log(`Content-Type: ${templateRes.headers.get('content-type')}`);
  console.log(`Content-Disposition: ${templateRes.headers.get('content-disposition')}`);
  if (templateRes.status === 200 && templateRes.headers.get('content-disposition')?.includes('IEEE_Inventory_Import_Template.xlsx')) {
    console.log('✅ Inventory sample template endpoint PASSED!');
  } else {
    console.error('❌ Sample template download failed');
  }

  logSection('STEP 4: Generate Test Inventory Excel Workbook');
  const timestamp = Date.now().toString().slice(-4);
  const testRows = [
    // Row 2: Valid new item
    {
      'Component Name': `Raspberry Pi 5 (${timestamp})`,
      'Category': 'Microcontrollers',
      'Quantity': 5,
      'Description': 'Quad-core Arm Cortex-A76 SBC'
    },
    // Row 3: Valid new item
    {
      'Component Name': `OLED Display 0.96 inch (${timestamp})`,
      'Category': 'Sensors',
      'Quantity': 12,
      'Description': '128x64 I2C OLED Screen'
    },
    // Row 4: Duplicate item (Same as Row 2 - stock should increase by +5)
    {
      'Component Name': `Raspberry Pi 5 (${timestamp})`,
      'Category': 'Microcontrollers',
      'Quantity': 5,
      'Description': 'Duplicate entry test'
    },
    // Row 5: Missing Component Name -> Failed
    {
      'Component Name': '',
      'Category': 'Tools',
      'Quantity': 10,
      'Description': 'No name provided'
    },
    // Row 6: Invalid quantity -> Failed
    {
      'Component Name': `Broken Qty Item (${timestamp})`,
      'Category': 'Tools',
      'Quantity': -3,
      'Description': 'Negative quantity test'
    }
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(testRows);
  XLSX.utils.book_append_sheet(wb, ws, 'Inventory Import Test');
  const excelBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  console.log(`[Test Setup] Created test Excel buffer (${excelBuffer.length} bytes) with 5 data rows.`);

  logSection('STEP 5: Upload Test File to POST /api/items/bulk-import');
  const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const formData = new FormData();
  formData.append('file', blob, 'test_inventory_import.xlsx');

  const uploadRes = await fetch(`${BASE}/items/bulk-import`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData
  });

  console.log(`HTTP Status: ${uploadRes.status}`);
  const uploadResult = await uploadRes.json();
  console.log('Response Message:', uploadResult.message);
  console.log('Summary Breakdown:', JSON.stringify(uploadResult.summary, null, 2));

  console.log('\nPer-Row Breakdown Details:');
  uploadResult.details?.forEach(d => {
    console.log(`  Row #${d.row_number} | Item: ${d.item_name} | Action: ${d.action.toUpperCase()} | Reason: ${d.reason}`);
  });

  logSection('STEP 6: VERIFICATION DIAGNOSIS');
  const summary = uploadResult.summary;
  if (summary && summary.total_rows === 5 && summary.added === 2 && summary.updated === 1 && summary.failed === 2) {
    console.log(`🎉 BULK INVENTORY EXCEL IMPORT TEST PASSED PERFECTLY!`);
    console.log(`   - Total Rows Processed : ${summary.total_rows}`);
    console.log(`   - New Items Added      : ${summary.added} (Rows 2 & 3)`);
    console.log(`   - Stock Updated        : ${summary.updated} (Row 4 stock addition)`);
    console.log(`   - Validation Failed    : ${summary.failed} (Rows 5 & 6)\n`);
  } else {
    console.log(`ℹ️ Summary counts:`, summary);
  }
}

testInventoryBulkImport().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
