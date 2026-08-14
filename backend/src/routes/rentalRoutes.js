import express from 'express';
import * as XLSX from 'xlsx';
import { getDbClient } from '../db/database.js';
import { authenticateAdmin } from '../middleware/auth.js';
import { triggerOverdueCheck, triggerReminderCheck } from '../services/cronService.js';
import { sendLowStockAdminAlert, sendRentalConfirmationEmail } from '../services/emailService.js';
import { getTodayStr } from '../utils/dateUtils.js';

const router = express.Router();

// All rental management routes require Admin JWT authentication
router.use(authenticateAdmin);

// GET /api/rentals (View all rentals in Excel-like table with filters & stats)
router.get('/', async (req, res) => {
  try {
    const { status, member_id, item_id, search } = req.query;
    const db = getDbClient();
    const todayStr = getTodayStr();

    // ── Diagnostic & Auto-Sync ──────────────────────────────────────────────
    console.log(`[RentalRoutes] 🔍 GET /api/rentals triggered.`);
    console.log(`[RentalRoutes] 📅 Server local date: "${todayStr}" (Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone})`);

    // Log distinct status values in database
    const distinctStatuses = await db.all(`SELECT DISTINCT status FROM rentals`);
    console.log(`[RentalRoutes] 📊 Distinct status values in DB:`, distinctStatuses.map(s => s.status));

    // Auto-update DB status for any active rental past due date
    // PostgreSQL: use $1 param, result.rowCount for affected rows
    const updateResult = await db.run(`
      UPDATE rentals
      SET status = 'Overdue'
      WHERE date_returned IS NULL
        AND return_due_date < $1
        AND status != 'Overdue'
    `, [todayStr]);
    if (updateResult.changes > 0) {
      console.log(`[RentalRoutes] ⚡ Auto-updated ${updateResult.changes} past-due rental(s) to status 'Overdue'.`);
    }

    // Query test in isolation: Count unreturned records past due date
    const isolationCount = await db.get(`
      SELECT COUNT(*) as count FROM rentals
      WHERE date_returned IS NULL AND return_due_date < $1
    `, [todayStr]);
    console.log(`[RentalRoutes] 🧪 Isolation Query Check: Found ${isolationCount.count} unreturned rental(s) with return_due_date < "${todayStr}".`);

    // ── Fetch Rentals ────────────────────────────────────────────────────────
    let query = `
      SELECT r.id, r.item_id, r.member_id, r.quantity, r.status,
             r.date_taken::text as date_taken,
             r.return_due_date::text as return_due_date,
             r.date_returned::text as date_returned,
             r.borrower_email, r.borrower_phone, r.created_at,
             i.name as item_name, i.category as item_category, i.available_qty as current_item_stock,
             m.membership_id, m.name as member_name, m.class_name as member_class,
             m.department as member_department, m.status as member_status,
             r.borrower_email as member_email, r.borrower_phone as member_phone
      FROM rentals r
      JOIN items i ON r.item_id = i.id
      JOIN members m ON r.member_id = m.id
      WHERE 1=1
    `;
    const params = [];
    let paramIndex = 1;

    if (status && status !== 'All') {
      if (status === 'Overdue') {
        query += ` AND (r.status = 'Overdue' OR (r.date_returned IS NULL AND r.return_due_date < $${paramIndex}))`;
        params.push(todayStr);
        paramIndex++;
      } else {
        query += ` AND r.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }
    }

    if (member_id) {
      query += ` AND r.member_id = $${paramIndex}`;
      params.push(member_id);
      paramIndex++;
    }

    if (item_id) {
      query += ` AND r.item_id = $${paramIndex}`;
      params.push(item_id);
      paramIndex++;
    }

    if (search) {
      query += ` AND (i.name ILIKE $${paramIndex} OR m.name ILIKE $${paramIndex + 1} OR m.membership_id ILIKE $${paramIndex + 2} OR r.borrower_email ILIKE $${paramIndex + 3})`;
      const s = `%${search}%`;
      params.push(s, s, s, s);
      paramIndex += 4;
    }

    query += ` ORDER BY r.created_at DESC`;

    const rentals = await db.all(query, params);

    // Dynamic status mapping safety net
    const processedRentals = rentals.map(r => {
      const isReturned = r.date_returned !== null || (r.status && r.status.toLowerCase() === 'returned');
      const isPastDue = !isReturned && r.return_due_date < todayStr;
      const effectiveStatus = isReturned ? 'Returned' : isPastDue ? 'Overdue' : r.status;
      return {
        ...r,
        status: effectiveStatus
      };
    });

    console.log(`[RentalRoutes] 📤 Returning ${processedRentals.length} rental record(s) to client.`);
    console.log(`[RentalRoutes]    Summary breakdown:`);
    console.log(`[RentalRoutes]    - Active   : ${processedRentals.filter(r => r.status === 'Active').length}`);
    console.log(`[RentalRoutes]    - Overdue  : ${processedRentals.filter(r => r.status === 'Overdue').length}`);
    console.log(`[RentalRoutes]    - Returned : ${processedRentals.filter(r => r.status === 'Returned').length}`);

    return res.json(processedRentals);
  } catch (error) {
    console.error('Error fetching rentals:', error);
    return res.status(500).json({ error: 'Failed to retrieve rentals.' });
  }
});

// GET /api/rentals/export-log (Admin only: Download Excel workbook — Members + Rentals sheets)
router.get('/export-log', authenticateAdmin, async (req, res) => {
  try {
    const db = getDbClient();
    const todayStr = getTodayStr();

    // ── 1. Fetch all (non-deleted) Members ──────────────────────────────────
    const members = await db.all(`
      SELECT id, membership_id, name, email, phone, department, status, created_at
      FROM members
      WHERE is_deleted = 0 OR is_deleted IS NULL
      ORDER BY created_at ASC
    `);

    const membersRows = members.map((m, idx) => ({
      '#':               idx + 1,
      'Membership ID':   m.membership_id,
      'Full Name':       m.name,
      'Email':           m.email,
      'Phone':           m.phone || '',
      'Department':      m.department,
      'Status':          m.status || 'active',
      // PostgreSQL returns created_at as a Date object; convert to string safely
      'Registered Date': m.created_at ? new Date(m.created_at).toISOString().split('T')[0] : ''
    }));

    // ── 2. Fetch all Rental Records ─────────────────────────────────────────
    const rentals = await db.all(`
      SELECT r.id,
             r.date_taken, r.return_due_date, r.date_returned,
             r.quantity, r.status,
             r.borrower_email, r.borrower_phone,
             i.name   AS item_name,
             i.category AS item_category,
             m.name   AS member_name,
             m.membership_id
      FROM rentals r
      JOIN items   i ON r.item_id   = i.id
      JOIN members m ON r.member_id = m.id
      ORDER BY r.created_at ASC
    `);

    const rentalsRows = rentals.map((r, idx) => {
      // Derive effective display status
      const isReturned  = r.date_returned !== null || (r.status || '').toLowerCase() === 'returned';
      const isPastDue   = !isReturned && r.return_due_date < todayStr;
      const effectiveStatus = isReturned ? 'Returned' : isPastDue ? 'Overdue' : r.status;

      return {
        '#':              idx + 1,
        'Item Name':      r.item_name,
        'Category':       r.item_category,
        'Quantity':       r.quantity,
        'Member Name':    r.member_name,
        'Membership ID':  r.membership_id,
        'Borrower Email': r.borrower_email || '',
        'Borrower Phone': r.borrower_phone || '',
        'Issue Date':     r.date_taken,
        'Due Date':       r.return_due_date,
        'Return Date':    r.date_returned || '',
        'Status':         effectiveStatus
      };
    });

    // ── 3. Build workbook ───────────────────────────────────────────────────
    const wb = XLSX.utils.book_new();

    // --- Members sheet ---
    const wsMembersData = membersRows.length > 0 ? membersRows : [{
      '#': '', 'Membership ID': '', 'Full Name': '', 'Email': '',
      'Phone': '', 'Department': '', 'Status': '', 'Registered Date': ''
    }];
    const wsMembers = XLSX.utils.json_to_sheet(wsMembersData);
    wsMembers['!cols'] = [
      { wch: 5  }, // #
      { wch: 18 }, // Membership ID
      { wch: 26 }, // Full Name
      { wch: 30 }, // Email
      { wch: 16 }, // Phone
      { wch: 22 }, // Department
      { wch: 10 }, // Status
      { wch: 16 }  // Registered Date
    ];
    XLSX.utils.book_append_sheet(wb, wsMembers, 'Members');

    // --- Rentals sheet ---
    const wsRentalsData = rentalsRows.length > 0 ? rentalsRows : [{
      '#': '', 'Item Name': '', 'Category': '', 'Quantity': '',
      'Member Name': '', 'Membership ID': '', 'Borrower Email': '',
      'Borrower Phone': '', 'Issue Date': '', 'Due Date': '',
      'Return Date': '', 'Status': ''
    }];
    const wsRentals = XLSX.utils.json_to_sheet(wsRentalsData);
    wsRentals['!cols'] = [
      { wch: 5  }, // #
      { wch: 28 }, // Item Name
      { wch: 20 }, // Category
      { wch: 10 }, // Quantity
      { wch: 24 }, // Member Name
      { wch: 18 }, // Membership ID
      { wch: 30 }, // Borrower Email
      { wch: 16 }, // Borrower Phone
      { wch: 14 }, // Issue Date
      { wch: 14 }, // Due Date
      { wch: 14 }, // Return Date
      { wch: 12 }  // Status
    ];
    XLSX.utils.book_append_sheet(wb, wsRentals, 'Rentals');

    // ── 4. Stream file to client ────────────────────────────────────────────
    const dateTag = todayStr.replace(/-/g, '');
    const filename = `IEEE_Inventory_Log_${dateTag}.xlsx`;
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    console.log(`[RentalRoutes] 📥 Export log sent: ${members.length} member(s), ${rentals.length} rental(s) → "${filename}"`);
    return res.send(buffer);
  } catch (error) {
    console.error('[RentalRoutes] ❌ Error generating Excel log:', error);
    return res.status(500).json({ error: 'Failed to generate Excel log file.' });
  }
});

// POST /api/rentals (Create new rental — IEEE membership verification is mandatory)
router.post('/', async (req, res) => {
  try {
    const {
      item_id,
      borrower_email,
      borrower_phone,
      borrower_name,
      borrower_class,
      borrower_department,
      membership_id,
      quantity,
      date_taken,
      return_due_date
    } = req.body;

    // ── Validate required fields ──────────────────────────────────────────────────────
    if (!item_id) {
      return res.status(400).json({ error: 'Please select an inventory item.' });
    }
    if (!membership_id || !membership_id.trim()) {
      return res.status(400).json({ error: 'IEEE Membership ID is required.' });
    }
    if (!borrower_name || !borrower_name.trim()) {
      return res.status(400).json({ error: 'Borrower name is required.' });
    }
    if (!borrower_email || !borrower_email.trim()) {
      return res.status(400).json({ error: 'Email address is required.' });
    }
    if (!borrower_phone || !borrower_phone.trim()) {
      return res.status(400).json({ error: 'Phone number is required.' });
    }
    if (!borrower_class || !borrower_class.trim()) {
      return res.status(400).json({ error: 'Class is required.' });
    }
    if (!borrower_department || !borrower_department.trim()) {
      return res.status(400).json({ error: 'Department is required.' });
    }
    if (!return_due_date) {
      return res.status(400).json({ error: 'Return due date is required.' });
    }

    const takenDate = date_taken || getTodayStr();

    if (return_due_date <= takenDate) {
      return res.status(400).json({ error: 'Return due date must be after the date of issue.' });
    }

    const qtyNum = parseInt(quantity || 1, 10);
    if (isNaN(qtyNum) || qtyNum <= 0) {
      return res.status(400).json({ error: 'Rental quantity must be a positive integer.' });
    }

    const db = getDbClient();
    const cleanMembershipId = membership_id.trim();
    const cleanName = borrower_name.trim();
    const cleanEmail = borrower_email.trim();
    const cleanPhone = borrower_phone.trim();
    const cleanClass = borrower_class.trim();
    const cleanDepartment = borrower_department.trim();

    // ── Soft lookup/register member ──────────────────────────────────────────
    let member = await db.get(
      `SELECT id, name FROM members WHERE LOWER(membership_id) = LOWER($1)`,
      [cleanMembershipId]
    );

    if (!member) {
      const newMemberResult = await db.run(
        `INSERT INTO members (membership_id, name, email, phone, class_name, department, status, is_deleted)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', 0) RETURNING id`,
        [cleanMembershipId, cleanName, cleanEmail, cleanPhone || '', cleanClass, cleanDepartment]
      );
      member = { id: newMemberResult.lastID, name: cleanName };
    } else {
      // Update contact details and ensure the member is visible (un-delete if previously soft-deleted)
      await db.run(
        `UPDATE members SET name = $1, email = $2, phone = $3, class_name = $4, department = $5, is_deleted = 0 WHERE id = $6`,
        [cleanName, cleanEmail, cleanPhone || '', cleanClass, cleanDepartment, member.id]
      );
    }

    const targetMemberId = member.id;
    const displayName = member.name;

    // ── Verify item exists and check available stock ──────────────────────────
    const item = await db.get('SELECT * FROM items WHERE id = $1', [item_id]);
    if (!item) {
      return res.status(404).json({ error: 'Selected item was not found.' });
    }
    if (item.available_qty < qtyNum) {
      return res.status(400).json({
        error: `Insufficient stock! Only ${item.available_qty} unit(s) of "${item.name}" available, but ${qtyNum} requested.`
      });
    }

    // ── Begin transaction: decrement stock + insert rental ───────────────────
    let createdRentalId;
    let remainingQty;
    await db.transaction(async (client) => {
      const stockUpdate = await client.query(
        `UPDATE items SET available_qty = available_qty - $1 WHERE id = $2 AND available_qty >= $1 RETURNING available_qty`,
        [qtyNum, item_id]
      );
      if (stockUpdate.rowCount !== 1) {
        const error = new Error('Stock changed while issuing. Refresh and try again.');
        error.statusCode = 409;
        throw error;
      }
      remainingQty = stockUpdate.rows[0].available_qty;

      const rentalRes = await client.query(
        `INSERT INTO rentals
           (item_id, member_id, quantity, date_taken, return_due_date, date_returned, status, borrower_email, borrower_phone)
         VALUES ($1, $2, $3, $4, $5, NULL, 'Active', $6, $7) RETURNING id`,
        [item_id, targetMemberId, qtyNum, takenDate, return_due_date, cleanEmail, cleanPhone]
      );
      createdRentalId = rentalRes.rows[0].id;
    });

    // Trigger low-stock alert if stock hits zero
    if (remainingQty <= 0) {
      sendLowStockAdminAlert({
        itemName: item.name,
        category: item.category,
        availableQty: remainingQty,
        totalQty: item.total_qty
      }).catch(err => console.error('[LowStockAlert] Error dispatching email:', err));
    }

    const createdRental = await db.get(`
      SELECT r.id, r.item_id, r.member_id, r.quantity, r.status,
             r.date_taken::text as date_taken,
             r.return_due_date::text as return_due_date,
             r.date_returned::text as date_returned,
             r.borrower_email, r.borrower_phone, r.created_at,
             i.name as item_name, i.category as item_category,
             m.membership_id, m.name as member_name, m.class_name as member_class,
             m.department as member_department, m.status as member_status,
             r.borrower_email as member_email, r.borrower_phone as member_phone
      FROM rentals r
      JOIN items i ON r.item_id = i.id
      JOIN members m ON r.member_id = m.id
      WHERE r.id = $1
    `, [createdRentalId]);

    // ── Dispatch Confirmation Email ────────────────────────────────────────────────
    let emailResult = null;
    try {
      emailResult = await Promise.race([sendRentalConfirmationEmail({
        memberName:   displayName,
        memberEmail:  cleanEmail,
        membershipId: cleanMembershipId,
        itemName:     item.name,
        quantity:     qtyNum,
        dateIssued:   takenDate,
        dueDate:      return_due_date
      }), new Promise(resolve => setTimeout(() => resolve({ queued: true }), 750))]);
      console.log(`[RentalRoutes] Confirmation email result for "${cleanEmail}":`, emailResult);
    } catch (mailErr) {
      console.error(`[RentalRoutes] ❌ Exception dispatching confirmation email to "${cleanEmail}":`, mailErr);
      emailResult = { success: false, error: mailErr.message };
    }

    return res.status(201).json({
      message: emailResult?.success
        ? 'Rental record created successfully and confirmation email sent.'
        : emailResult?.queued
          ? 'Rental record created successfully. Email delivery is continuing in the background.'
          : 'Rental record created, but confirmation email could not be sent.',
      rental: createdRental,
      email_status: {
        queued: emailResult?.queued || false,
        sent: emailResult?.success || false,
        messageId: emailResult?.messageId || null,
        error: emailResult?.error || null
      }
    });
  } catch (error) {
    console.error('Error creating rental:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to create rental record.' });
  }
});


// POST /api/rentals/:id/return (Mark rental as Returned)
router.post('/:id/return', async (req, res) => {
  try {
    const { id } = req.params;
    const db = getDbClient();

    const rental = await db.get('SELECT * FROM rentals WHERE id = $1', [id]);
    if (!rental) {
      return res.status(404).json({ error: 'Rental record not found.' });
    }

    if (rental.date_returned !== null || rental.status === 'Returned') {
      return res.status(400).json({ error: 'This rental record has already been returned.' });
    }

    const todayStr = getTodayStr();

    // Begin Transaction to restore stock and update rental
    await db.transaction(async (client) => {
      const returnResult = await client.query(
        `UPDATE rentals SET date_returned = $1, status = 'Returned'
         WHERE id = $2 AND date_returned IS NULL AND status != 'Returned'
         RETURNING item_id, quantity`,
        [todayStr, id]
      );
      if (returnResult.rowCount !== 1) {
        const error = new Error('This rental was already returned by another request.');
        error.statusCode = 409;
        throw error;
      }
      await client.query(
        `UPDATE items SET available_qty = available_qty + $1 WHERE id = $2`,
        [returnResult.rows[0].quantity, returnResult.rows[0].item_id]
      );
    });

    const updatedRental = await db.get(`
      SELECT r.*,
             i.name as item_name, i.category as item_category,
             m.membership_id, m.name as member_name, m.email as member_email, m.department as member_department
      FROM rentals r
      JOIN items i ON r.item_id = i.id
      JOIN members m ON r.member_id = m.id
      WHERE r.id = $1
    `, [id]);

    return res.json({
      message: 'Item returned successfully and stock updated.',
      rental: updatedRental
    });
  } catch (error) {
    console.error('Error processing return:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Failed to process item return.' });
  }
});

// POST /api/rentals/cron-trigger (Manual trigger: runs both reminder + overdue checks)
router.post('/cron-trigger', async (req, res) => {
  try {
    const [reminderResult, overdueResult] = await Promise.allSettled([
      triggerReminderCheck(),
      triggerOverdueCheck()
    ]);

    return res.json({
      message: 'Daily email audit completed.',
      reminder_check: reminderResult.status === 'fulfilled'
        ? { success: true, data: reminderResult.value }
        : { success: false, error: reminderResult.reason?.message },
      overdue_check: overdueResult.status === 'fulfilled'
        ? { success: true, data: overdueResult.value }
        : { success: false, error: overdueResult.reason?.message }
    });
  } catch (error) {
    console.error('Error running cron trigger:', error);
    return res.status(500).json({ error: 'Failed to run email audit.' });
  }
});

// DELETE /api/rentals/:id (Admin only: Delete a rental log entry)
router.delete('/:id', async (req, res) => {
  const { id } = req.params;
  console.log(`[RentalRoutes] 🗑️  DELETE /api/rentals/${id} - Request received`);

  try {
    const db = getDbClient();

    // 1. Verify the rental exists
    const rental = await db.get('SELECT * FROM rentals WHERE id = $1', [id]);
    console.log(`[RentalRoutes] 🔍 Rental #${id} lookup result:`, rental ? `found (status=${rental.status}, date_returned=${rental.date_returned})` : 'NOT FOUND');

    if (!rental) {
      console.warn(`[RentalRoutes] ⚠️  Rental #${id} not found in database.`);
      return res.status(404).json({ error: `Rental record #${id} not found.` });
    }

    // 2. Determine if stock needs to be restored
    const isUnreturned = rental.date_returned === null && rental.status !== 'Returned';
    console.log(`[RentalRoutes] 📦 isUnreturned=${isUnreturned} (will restore ${isUnreturned ? rental.quantity : 0} unit(s) to item #${rental.item_id})`);

    // 3. Execute within a transaction
    await db.transaction(async (client) => {
      if (isUnreturned) {
        const stockResult = await client.query(
          `UPDATE items SET available_qty = available_qty + $1 WHERE id = $2`,
          [rental.quantity, rental.item_id]
        );
        console.log(`[RentalRoutes] ✅ Stock restored: ${stockResult.rowCount} item(s) updated`);
      }

      const delResult = await client.query('DELETE FROM rentals WHERE id = $1', [id]);
      console.log(`[RentalRoutes] ✅ DELETE result: ${delResult.rowCount} row(s) removed`);
    });

    console.log(`[RentalRoutes] ✅ Transaction committed - Rental #${id} deleted successfully`);

    return res.json({
      message: `Rental record #${id} deleted successfully.${isUnreturned ? ' Stock has been restored.' : ''}`
    });
  } catch (error) {
    console.error(`[RentalRoutes] ❌ Failed to delete rental #${id}:`, error.message, '| code:', error.code, '| stack:', error.stack);
    return res.status(500).json({
      error: `Failed to delete rental record: ${error.message}`
    });
  }
});

// GET /api/rentals/overdue-status (Admin diagnostics: see overdue rentals + email history)
router.get('/overdue-status', async (req, res) => {
  try {
    const db = getDbClient();
    const { getTodayStr } = await import('../utils/dateUtils.js');
    const todayStr = getTodayStr();

    // All unreturned rentals past due date
    const overdueRentals = await db.all(`
      SELECT r.id AS rental_id, r.return_due_date::text AS return_due_date, r.status,
             m.name AS member_name,
             COALESCE(NULLIF(r.borrower_email, ''), m.email) AS member_email,
             m.membership_id,
             i.name AS item_name,
             (
               SELECT sent_at::text FROM email_notifications
               WHERE rental_id = r.id AND type = 'overdue'
               ORDER BY sent_at DESC LIMIT 1
             ) AS last_overdue_email_sent
      FROM rentals r
      JOIN members m ON r.member_id = m.id
      JOIN items   i ON r.item_id   = i.id
      WHERE r.date_returned IS NULL
        AND r.return_due_date < $1
      ORDER BY r.return_due_date ASC
    `, [todayStr]);

    const repeatDays = parseInt(process.env.OVERDUE_REPEAT_EVERY_DAYS, 10) || 0;
    const cronSchedule = process.env.CRON_SCHEDULE || '0 7 * * *';

    const enriched = overdueRentals.map(r => {
      const daysOverdue = Math.floor(
        (new Date(todayStr) - new Date(r.return_due_date)) / (1000 * 60 * 60 * 24)
      );
      let willSkip = false;
      let skipReason = null;
      if (repeatDays === 0 && r.last_overdue_email_sent) {
        willSkip = true;
        skipReason = `send-once mode: already notified on ${r.last_overdue_email_sent}`;
      } else if (repeatDays > 0 && r.last_overdue_email_sent) {
        const daysSince = Math.floor(
          (new Date(todayStr) - new Date(r.last_overdue_email_sent)) / (1000 * 60 * 60 * 24)
        );
        if (daysSince < repeatDays) {
          willSkip = true;
          skipReason = `repeat window: last sent ${daysSince}d ago, repeat every ${repeatDays}d`;
        }
      }
      return { ...r, days_overdue: daysOverdue, will_email_be_skipped: willSkip, skip_reason: skipReason };
    });

    return res.json({
      server_date: todayStr,
      cron_schedule: cronSchedule,
      overdue_repeat_mode: repeatDays === 0 ? 'send_once' : `every_${repeatDays}_days`,
      total_overdue_rentals: overdueRentals.length,
      rentals: enriched
    });
  } catch (error) {
    console.error('[RentalRoutes] Error fetching overdue status:', error);
    return res.status(500).json({ error: 'Failed to fetch overdue status.' });
  }
});

// POST /api/rentals/reminder-trigger (Manual trigger: return reminder check only)
router.post('/reminder-trigger', async (req, res) => {
  try {
    const reminderResult = await triggerReminderCheck();
    return res.json({
      message: 'Return reminder check completed.',
      data: reminderResult
    });
  } catch (error) {
    console.error('Error running reminder check:', error);
    return res.status(500).json({ error: 'Failed to run reminder check.' });
  }
});

export default router;
