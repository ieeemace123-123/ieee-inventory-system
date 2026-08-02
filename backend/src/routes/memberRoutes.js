import express from 'express';
import * as XLSX from 'xlsx';
import multer from 'multer';
import { getDbClient } from '../db/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// Multer in-memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB max file size
});

// ── SPECIFIC NAMED ROUTES (Must be placed before /:id parameterized routes) ──

// GET /api/members/verify/:membership_id (Public endpoint for background IEEE membership verification)
router.get('/verify/:membership_id', async (req, res) => {
  try {
    const { membership_id } = req.params;
    if (!membership_id || !membership_id.trim()) {
      return res.status(400).json({ valid: false, status: 'error', message: 'Membership ID is required.' });
    }

    const db = getDbClient();
    const cleanId = membership_id.trim();

    // PostgreSQL: use ILIKE for case-insensitive comparison
    const member = await db.get(
      'SELECT id, membership_id, name, email, department, status, is_deleted FROM members WHERE LOWER(membership_id) = LOWER($1)',
      [cleanId]
    );

    if (!member || member.is_deleted) {
      return res.status(200).json({
        valid: false,
        status: 'not_found',
        message: 'Membership not found or inactive — please contact the branch admin.'
      });
    }

    const isMemberActive = (member.status || 'active').toLowerCase() === 'active';

    if (!isMemberActive) {
      return res.status(200).json({
        valid: false,
        status: 'inactive',
        message: 'Membership not found or inactive — please contact the branch admin.',
        member: {
          id: member.id,
          membership_id: member.membership_id,
          name: member.name,
          department: member.department,
          status: 'inactive'
        }
      });
    }

    return res.status(200).json({
      valid: true,
      status: 'active',
      message: 'Verified IEEE Member',
      member: {
        id: member.id,
        membership_id: member.membership_id,
        name: member.name,
        email: member.email,
        department: member.department,
        status: 'active'
      }
    });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error verifying membership ID:', error);
    return res.status(500).json({ valid: false, status: 'error', message: 'Failed to verify IEEE membership ID.' });
  }
});

// Protect ALL member management routes below with Admin JWT authentication
router.use(authenticateAdmin);

// GET /api/members/sample-template (Download sample Excel template - Admin required)
router.get('/sample-template', (req, res) => {
  try {
    const wb = XLSX.utils.book_new();
    const sampleData = [
      {
        'Membership ID': 'IEEE-2001',
        'Full Name': 'Sarah Connor',
        'Status': 'active'
      },
      {
        'Membership ID': 'IEEE-2002',
        'Full Name': 'David Miller',
        'Status': 'active'
      },
      {
        'Membership ID': 'IEEE-2003',
        'Full Name': 'Elena Rostova',
        'Status': 'inactive'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(sampleData);
    ws['!cols'] = [
      { wch: 18 }, // Membership ID
      { wch: 24 }, // Full Name
      { wch: 12 }  // Status
    ];

    XLSX.utils.book_append_sheet(wb, ws, 'IEEE Members');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="IEEE_Member_Import_Template.xlsx"');
    return res.send(buffer);
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error generating sample Excel template:', error);
    return res.status(500).json({ error: 'Failed to generate sample Excel template.' });
  }
});

// POST /api/members/bulk-import (Admin only: Upload & parse Excel/CSV for bulk member registration)
router.post('/bulk-import', authenticateAdmin, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No Excel or CSV file uploaded.' });
    }

    const filename = req.file.originalname || '';
    const ext = filename.split('.').pop().toLowerCase();
    if (!['xlsx', 'xls', 'csv'].includes(ext)) {
      return res.status(400).json({ error: `Unsupported file format ".${ext}". Please upload a .xlsx, .xls, or .csv file.` });
    }

    let workbook;
    try {
      workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
    } catch (parseErr) {
      return res.status(400).json({ error: 'Failed to parse Excel file. The file may be corrupt or unreadable.' });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ error: 'Uploaded Excel file contains no worksheets.' });
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

    if (!rows || rows.length === 0) {
      return res.status(400).json({ error: 'Uploaded file contains no data rows.' });
    }

    console.log(`[MemberRoutes] 📊 Processing bulk import file "${filename}" with ${rows.length} row(s)...`);

    const db = getDbClient();
    const seenIdsInBatch = new Set();
    const details = [];

    let addedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    // Use transaction helper for atomicity
    await db.transaction(async (client) => {
      for (let index = 0; index < rows.length; index++) {
        const row = rows[index];
        const rowNum = index + 2; // Row 1 is header

        const membershipId = String(
          row['Membership ID'] || row['membership_id'] || row['Roll No / ID'] || row['ID'] || ''
        ).trim();

        const name = String(
          row['Full Name'] || row['Name'] || row['name'] || ''
        ).trim();

        const rawStatus = String(
          row['Status'] || row['status'] || row['Member Status'] || 'active'
        ).trim().toLowerCase();
        const memberStatus = ['active', 'inactive'].includes(rawStatus) ? rawStatus : 'active';

        const email = String(
          row['Email Address'] || row['email'] || row['Email'] || 'not-set@ieee.local'
        ).trim();

        const phone = String(
          row['Phone Number'] || row['phone'] || row['Phone'] || ''
        ).trim();

        const department = String(
          row['Department'] || row['department'] || row['Branch'] || 'IEEE Member'
        ).trim();

        // 1. Check required fields: Membership ID and Name are mandatory
        if (!membershipId || !name) {
          skippedCount++;
          const missing = [];
          if (!membershipId) missing.push('Membership ID');
          if (!name) missing.push('Full Name');

          details.push({
            row_number: rowNum,
            membership_id: membershipId || 'N/A',
            name: name || 'N/A',
            action: 'skipped',
            reason: `Skipped: Missing required field(s): ${missing.join(', ')}`
          });
          continue;
        }

        const normalizedId = membershipId.toLowerCase();

        // 2. Check if already processed in this upload batch
        if (seenIdsInBatch.has(normalizedId)) {
          await client.query(
            `UPDATE members SET name = $1, status = $2, is_deleted = 0 WHERE LOWER(membership_id) = $3`,
            [name, memberStatus, normalizedId]
          );
          updatedCount++;
          details.push({
            row_number: rowNum,
            membership_id: membershipId,
            name,
            action: 'updated',
            reason: 'Updated: Duplicate Membership ID in file'
          });
          continue;
        }

        seenIdsInBatch.add(normalizedId);

        // 3. Database lookup for existing member
        const existingRes = await client.query(
          `SELECT id FROM members WHERE LOWER(membership_id) = $1`,
          [normalizedId]
        );
        const existingMember = existingRes.rows[0] || null;

        if (existingMember) {
          // Upsert: Update existing member record
          await client.query(
            `UPDATE members SET name = $1, status = $2, is_deleted = 0 WHERE id = $3`,
            [name, memberStatus, existingMember.id]
          );
          updatedCount++;
          details.push({
            row_number: rowNum,
            membership_id: membershipId,
            name,
            action: 'updated',
            reason: 'Updated: Existing member record in database'
          });
        } else {
          // Insert new member
          await client.query(
            `INSERT INTO members (membership_id, name, email, phone, department, status, is_deleted)
             VALUES ($1, $2, $3, $4, $5, $6, 0)`,
            [membershipId, name, email, phone || null, department, memberStatus]
          );
          addedCount++;
          details.push({
            row_number: rowNum,
            membership_id: membershipId,
            name,
            action: 'added',
            reason: 'Imported successfully'
          });
        }
      }
    });

    const messageParts = [];
    if (addedCount > 0) messageParts.push(`${addedCount} members imported successfully`);
    if (updatedCount > 0) messageParts.push(`${updatedCount} updated (duplicates)`);
    if (skippedCount > 0) messageParts.push(`${skippedCount} skipped due to missing data`);

    const summaryMessage = messageParts.length > 0
      ? messageParts.join(', ') + '.'
      : 'No valid rows to process.';

    return res.status(200).json({
      message: summaryMessage,
      summary: {
        total_rows: rows.length,
        added: addedCount,
        updated: updatedCount,
        skipped: skippedCount
      },
      details
    });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error in bulk import:', error);
    return res.status(500).json({ error: error.message || 'Failed to import members.' });
  }
});

// GET /api/members (Fetch active, non-deleted members)
router.get('/', async (req, res) => {
  try {
    const { search } = req.query;
    const db = getDbClient();

    let query = `
      SELECT m.*,
             COUNT(CASE WHEN r.id IS NOT NULL AND r.date_returned IS NULL THEN 1 END) as active_rentals_count,
             COUNT(r.id) as total_rentals_count
      FROM members m
      LEFT JOIN rentals r ON m.id = r.member_id
      WHERE (m.is_deleted IS NULL OR m.is_deleted = 0)
    `;
    const params = [];
    let paramIndex = 1;

    if (search) {
      query += ` AND (m.name ILIKE $${paramIndex} OR m.membership_id ILIKE $${paramIndex + 1} OR m.email ILIKE $${paramIndex + 2} OR m.department ILIKE $${paramIndex + 3})`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
      paramIndex += 4;
    }

    query += ` GROUP BY m.id ORDER BY m.created_at DESC`;

    const members = await db.all(query, params);
    return res.json(members);
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error fetching members:', error);
    return res.status(500).json({ error: 'Failed to retrieve members.' });
  }
});

// POST /api/members (Admin only: Add new member or restore soft-deleted member)
router.post('/', authenticateAdmin, async (req, res) => {
  try {
    const { membership_id, name, email, phone, department, status } = req.body;

    console.log('[MemberRoutes] ➕ POST /api/members payload:', req.body);

    if (!membership_id || !name || !email || !department) {
      return res.status(400).json({ error: 'Membership ID, Name, Email, and Department are required.' });
    }

    const memberStatus = (status && ['active', 'inactive'].includes(status.toLowerCase())) ? status.toLowerCase() : 'active';
    const db = getDbClient();

    // Check existing membership_id
    const existing = await db.get('SELECT id, is_deleted FROM members WHERE membership_id = $1', [membership_id.trim()]);
    
    if (existing && !existing.is_deleted) {
      return res.status(400).json({ error: `Membership ID "${membership_id}" is already registered to an active member.` });
    }

    if (existing && existing.is_deleted) {
      // Restore previously soft-deleted member with new information
      await db.run(
        `UPDATE members SET name = $1, email = $2, phone = $3, department = $4, status = $5, is_deleted = 0 WHERE id = $6`,
        [name.trim(), email.trim(), phone ? phone.trim() : null, department.trim(), memberStatus, existing.id]
      );
      const restoredMember = await db.get('SELECT * FROM members WHERE id = $1', [existing.id]);
      console.log(`[MemberRoutes] 🔄 Restored soft-deleted member: ID=${existing.id}, MembershipID="${membership_id}"`);
      return res.status(200).json({ message: 'Previously deleted member restored and updated.', member: restoredMember });
    }

    const result = await db.run(
      `INSERT INTO members (membership_id, name, email, phone, department, status, is_deleted) VALUES ($1, $2, $3, $4, $5, $6, 0) RETURNING id`,
      [membership_id.trim(), name.trim(), email.trim(), phone ? phone.trim() : null, department.trim(), memberStatus]
    );

    const newMember = await db.get('SELECT * FROM members WHERE id = $1', [result.lastID]);
    console.log(`[MemberRoutes] ✅ Member created successfully: ID=${newMember.id}, MembershipID="${newMember.membership_id}"`);
    return res.status(201).json({ message: 'Member added successfully.', member: newMember });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error creating member:', error);
    // PostgreSQL unique violation code: 23505
    if (error.code === '23505') {
      return res.status(400).json({ error: 'A member with this Membership ID already exists.' });
    }
    return res.status(500).json({ error: 'Failed to create member.' });
  }
});

// ── PARAMETERIZED /:id ROUTES (Must be placed AFTER specific named routes) ──

// GET /api/members/:id (Detailed view with member rental history)
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDbClient();

    const member = await db.get('SELECT * FROM members WHERE id = $1', [id]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const rentals = await db.all(`
      SELECT r.*, i.name as item_name, i.category as item_category
      FROM rentals r
      JOIN items i ON r.item_id = i.id
      WHERE r.member_id = $1
      ORDER BY r.created_at DESC
    `, [id]);

    return res.json({ ...member, rentals });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error fetching member details:', error);
    return res.status(500).json({ error: 'Failed to retrieve member details.' });
  }
});

// PUT /api/members/:id (Admin only: Edit member)
router.put('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { membership_id, name, email, phone, department, status } = req.body;

    console.log(`[MemberRoutes] ✏️ PUT /api/members/${id} payload:`, req.body);

    if (!membership_id || !name || !email || !department) {
      return res.status(400).json({ error: 'Membership ID, Name, Email, and Department are required.' });
    }

    const db = getDbClient();

    const existingMember = await db.get('SELECT * FROM members WHERE id = $1', [id]);
    if (!existingMember) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const memberStatus = (status && ['active', 'inactive'].includes(status.toLowerCase()))
      ? status.toLowerCase()
      : (existingMember.status || 'active');

    // Check duplicate membership_id if changed
    if (membership_id.trim() !== existingMember.membership_id) {
      const duplicate = await db.get(
        'SELECT id FROM members WHERE membership_id = $1 AND id != $2 AND (is_deleted IS NULL OR is_deleted = 0)',
        [membership_id.trim(), id]
      );
      if (duplicate) {
        return res.status(400).json({ error: `Membership ID "${membership_id}" is already in use by another active member.` });
      }
    }

    await db.run(
      `UPDATE members SET membership_id = $1, name = $2, email = $3, phone = $4, department = $5, status = $6 WHERE id = $7`,
      [membership_id.trim(), name.trim(), email.trim(), phone ? phone.trim() : null, department.trim(), memberStatus, id]
    );

    // Sync borrower contact info for all active/unreturned rentals for this member
    await db.run(
      `UPDATE rentals SET borrower_email = $1, borrower_phone = $2 WHERE member_id = $3 AND date_returned IS NULL`,
      [email.trim(), phone ? phone.trim() : '', id]
    );

    const updatedMember = await db.get('SELECT * FROM members WHERE id = $1', [id]);
    console.log(`[MemberRoutes] ✅ Member updated successfully: ID=${id}`);
    return res.json({ message: 'Member updated successfully.', member: updatedMember });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error updating member:', error);
    // PostgreSQL unique violation code: 23505
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Membership ID is already in use.' });
    }
    return res.status(500).json({ error: 'Failed to update member.' });
  }
});

// PATCH /api/members/:id/status (Admin only: Toggle active/inactive status)
router.patch('/:id/status', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive'].includes(status.toLowerCase())) {
      return res.status(400).json({ error: 'Invalid status. Expected "active" or "inactive".' });
    }

    const db = getDbClient();
    const member = await db.get(
      'SELECT * FROM members WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = 0)',
      [id]
    );
    if (!member) {
      return res.status(404).json({ error: 'Member not found.' });
    }

    const newStatus = status.toLowerCase();
    await db.run('UPDATE members SET status = $1 WHERE id = $2', [newStatus, id]);

    const updatedMember = await db.get('SELECT * FROM members WHERE id = $1', [id]);
    console.log(`[MemberRoutes] 🔄 Status updated for member ID=${id}: "${newStatus}"`);
    return res.json({ message: `Member status updated to ${newStatus}.`, member: updatedMember });
  } catch (error) {
    console.error('[MemberRoutes] ❌ Error updating status:', error);
    return res.status(500).json({ error: 'Failed to update member status.' });
  }
});

// DELETE /api/members/:id (Admin only: Soft Delete member + Option C Block if Active/Overdue)
router.delete('/:id', authenticateAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const memberIdNum = parseInt(id, 10);

    console.log(`[MemberRoutes] 🗑️ DELETE /api/members/${id} requested by admin user: "${req.admin?.username}"`);

    if (isNaN(memberIdNum)) {
      console.error(`[MemberRoutes] ❌ Invalid Member ID format: "${id}"`);
      return res.status(400).json({ error: `Invalid member ID parameter: "${id}"` });
    }

    const db = getDbClient();

    const member = await db.get(
      'SELECT * FROM members WHERE id = $1 AND (is_deleted IS NULL OR is_deleted = 0)',
      [memberIdNum]
    );
    if (!member) {
      console.error(`[MemberRoutes] ❌ Member with ID ${memberIdNum} not found or is already deleted.`);
      return res.status(404).json({ error: `Member with ID ${memberIdNum} was not found or is already deleted.` });
    }

    console.log(`[MemberRoutes] 📋 Target Member Found: ID=${member.id}, MembershipID="${member.membership_id}", Name="${member.name}"`);

    // Option C: Block + Warn if member has an active or overdue rental
    const activeRental = await db.get(
      `SELECT r.id, r.return_due_date, r.status, i.name as item_name
       FROM rentals r
       JOIN items i ON r.item_id = i.id
       WHERE r.member_id = $1 AND r.date_returned IS NULL`,
      [memberIdNum]
    );

    if (activeRental) {
      console.warn(`[MemberRoutes] ⚠️ Deletion blocked: Member ${memberIdNum} has active/overdue rental #${activeRental.id} ("${activeRental.item_name}")`);
      return res.status(400).json({
        error: `Cannot delete: member has an active/overdue component rental (${activeRental.item_name}). Please resolve this first.`
      });
    }

    // Option A: Soft Delete
    await db.run('UPDATE members SET is_deleted = 1 WHERE id = $1', [memberIdNum]);

    console.log(`[MemberRoutes] ✅ Member "${member.name}" (ID: ${memberIdNum}) soft-deleted (is_deleted = 1). Audit history preserved.`);
    return res.json({
      message: `Member "${member.name}" marked as deleted/inactive. Historical rental records preserved for audit.`
    });
  } catch (error) {
    console.error(`[MemberRoutes] 💥 Error during member soft-deletion:`, error);
    return res.status(500).json({ error: error.message || 'Failed to delete member.' });
  }
});

export default router;
