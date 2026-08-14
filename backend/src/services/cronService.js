import cron from 'node-cron';
import { getDbClient } from '../db/database.js';
import { sendReturnReminderEmail, sendOverdueNoticeEmail } from './emailService.js';
import { getTodayStr } from '../utils/dateUtils.js';

// ─── Config helpers ────────────────────────────────────────────────────────────

/**
 * Days before the due date to send a reminder (default: 1).
 * Controlled by REMINDER_DAYS_BEFORE in .env
 */
function getReminderDaysBefore() {
  const val = parseInt(process.env.REMINDER_DAYS_BEFORE, 10);
  return Number.isFinite(val) && val > 0 ? val : 1;
}

/**
 * Overdue repeat cadence in days (default: 0 = send once ever).
 * Controlled by OVERDUE_REPEAT_EVERY_DAYS in .env
 * Set to a positive integer (e.g. 1) to re-notify every N days until returned.
 */
function getOverdueRepeatDays() {
  const val = parseInt(process.env.OVERDUE_REPEAT_EVERY_DAYS, 10);
  return Number.isFinite(val) && val >= 0 ? val : 0;
}

// ─── Reminder Check ────────────────────────────────────────────────────────────

/**
 * Finds rentals whose due date is exactly N days from today and sends a return
 * reminder email to each borrower. Skips rentals already notified today.
 */
export async function triggerReminderCheck() {
  const daysBefore = getReminderDaysBefore();
  console.log(`[CronService] Starting return reminder check (${daysBefore} day(s) before due)...`);

  const db = getDbClient();

  // PostgreSQL: cast DATE fields to ::text so they return formatted 'YYYY-MM-DD' strings
  const reminders = await db.all(`
    SELECT r.id AS rental_id,
           r.date_taken::text AS date_taken,
           r.return_due_date::text AS return_due_date,
           r.quantity, r.last_renewed_at,
           m.name AS member_name,
           COALESCE(NULLIF(r.borrower_email, ''), m.email) AS member_email,
           m.membership_id,
           i.name AS item_name
    FROM rentals r
    JOIN members m ON r.member_id = m.id
    JOIN items   i ON r.item_id   = i.id
    WHERE r.date_returned IS NULL
      AND r.return_due_date = CURRENT_DATE + ($1 * INTERVAL '1 day')
  `, [daysBefore]);

  console.log(`[CronService] Found ${reminders.length} rental(s) due in ${daysBefore} day(s).`);

  const results = [];

  for (const rental of reminders) {
    // Deduplication: skip if a reminder was already sent today for this rental
    const alreadySent = await db.get(`
      SELECT id FROM email_notifications
      WHERE rental_id = $1 AND type = 'reminder' AND sent_at = CURRENT_DATE
        AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
    `, [rental.rental_id, rental.last_renewed_at]);

    if (alreadySent) {
      console.log(`[CronService] ⏭️  Reminder already sent today for rental #${rental.rental_id}, skipping.`);
      results.push({ rental_id: rental.rental_id, skipped: true, reason: 'already_sent_today' });
      continue;
    }

    // Pre-send diagnostic: confirm email field is populated
    console.log(`[CronService] → Rental #${rental.rental_id} | Member: "${rental.member_name}" | Email: "${rental.member_email}" | Item: "${rental.item_name}" | Due: ${rental.return_due_date}`);
    if (!rental.member_email || !rental.member_email.includes('@')) {
      console.error(`[CronService] ❌ Skipping rental #${rental.rental_id} — member_email is invalid or missing: "${rental.member_email}"`);
      results.push({ rental_id: rental.rental_id, skipped: true, reason: 'invalid_email_in_db' });
      continue;
    }

    const emailResult = await sendReturnReminderEmail({
      memberName:   rental.member_name,
      memberEmail:  rental.member_email,
      membershipId: rental.membership_id,
      itemName:     rental.item_name,
      quantity:     rental.quantity,
      dateIssued:   rental.date_taken,
      dueDate:      rental.return_due_date
    });

    if (emailResult.success) {
      await db.run(`
        INSERT INTO email_notifications (rental_id, type, sent_at)
        VALUES ($1, 'reminder', CURRENT_DATE)
      `, [rental.rental_id]);
      console.log(`[CronService] ✅ Reminder sent to ${rental.member_email} for "${rental.item_name}"`);
    } else {
      console.error(`[CronService] ❌ Failed to send reminder to ${rental.member_email}: ${emailResult.error}`);
    }

    results.push({
      rental_id:      rental.rental_id,
      member_name:    rental.member_name,
      member_email:   rental.member_email,
      membership_id:  rental.membership_id,
      item_name:      rental.item_name,
      return_due_date: rental.return_due_date,
      email_sent:     emailResult.success,
      email_error:    emailResult.error || null,
      message_id:     emailResult.messageId || null
    });
  }

  console.log('[CronService] Return reminder check completed.');
  return {
    checked_at:    new Date().toISOString(),
    days_before:   daysBefore,
    total_checked: reminders.length,
    results
  };
}

// ─── Overdue Check ─────────────────────────────────────────────────────────────

/**
 * Finds rentals whose return_due_date has passed and that have not been returned.
 * Marks them as Overdue and sends a notice email, respecting the repeat cadence.
 *
 * Repeat logic (OVERDUE_REPEAT_EVERY_DAYS env var):
 *  - 0  → send once (skip if ANY overdue notification exists for this rental)
 *  - N  → re-send every N days (skip if last overdue notification was < N days ago)
 */
export async function triggerOverdueCheck() {
  const repeatDays = getOverdueRepeatDays();
  console.log(`[CronService] Starting overdue check (repeat cadence: ${repeatDays === 0 ? 'once' : `every ${repeatDays} day(s)`})...`);

  const db = getDbClient();
  const todayStr = getTodayStr();

  // All unreturned rentals whose due date is strictly in the past
  // PostgreSQL: cast DATE fields to ::text so they return clean 'YYYY-MM-DD' strings
  const overdueRentals = await db.all(`
    SELECT r.id AS rental_id,
           r.date_taken::text AS date_taken,
           r.return_due_date::text AS return_due_date,
           r.quantity, r.status, r.last_renewed_at,
           m.name AS member_name,
           COALESCE(NULLIF(r.borrower_email, ''), m.email) AS member_email,
           m.membership_id,
           i.name AS item_name
    FROM rentals r
    JOIN members m ON r.member_id = m.id
    JOIN items   i ON r.item_id   = i.id
    WHERE r.date_returned IS NULL
      AND r.return_due_date < $1
  `, [todayStr]);

  console.log(`[CronService] Found ${overdueRentals.length} overdue rental(s).`);

  const results = [];

  for (const rental of overdueRentals) {
    // 1. Mark status as 'Overdue' if not already set
    if (rental.status !== 'Overdue') {
      await db.run(`UPDATE rentals SET status = 'Overdue' WHERE id = $1`, [rental.rental_id]);
    }

    // 2. Deduplication / repeat-interval check
    let shouldSkip = false;

    if (repeatDays === 0) {
      // Send-once mode: skip if any overdue notification has ever been sent
      const anyPrior = await db.get(`
        SELECT id FROM email_notifications
        WHERE rental_id = $1 AND type = 'overdue'
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
        LIMIT 1
      `, [rental.rental_id, rental.last_renewed_at]);
      if (anyPrior) {
        shouldSkip = true;
      }
    } else {
      // Repeat mode: skip if the most recent overdue notification is within the repeat window
      const lastSent = await db.get(`
        SELECT sent_at::text AS sent_at FROM email_notifications
        WHERE rental_id = $1 AND type = 'overdue'
          AND ($2::timestamptz IS NULL OR created_at >= $2::timestamptz)
        ORDER BY sent_at DESC
        LIMIT 1
      `, [rental.rental_id, rental.last_renewed_at]);
      if (lastSent && lastSent.sent_at) {
        const daysSinceLast = Math.floor(
          (new Date(todayStr) - new Date(lastSent.sent_at)) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLast < repeatDays) {
          shouldSkip = true;
        }
      }
    }

    if (shouldSkip) {
      console.log(`[CronService] ⏭️  Overdue notice already sent for rental #${rental.rental_id}, skipping.`);
      results.push({ rental_id: rental.rental_id, skipped: true, reason: 'repeat_window_not_elapsed' });
      continue;
    }

    // 3. Calculate days overdue
    const daysOverdue = Math.floor(
      (new Date(todayStr) - new Date(rental.return_due_date)) / (1000 * 60 * 60 * 24)
    );

    // Pre-send diagnostic: confirm email field is populated
    console.log(`[CronService] → Rental #${rental.rental_id} | Member: "${rental.member_name}" | Email: "${rental.member_email}" | Item: "${rental.item_name}" | Overdue: ${daysOverdue}d`);
    if (!rental.member_email || !rental.member_email.includes('@')) {
      console.error(`[CronService] ❌ Skipping rental #${rental.rental_id} — member_email is invalid or missing: "${rental.member_email}"`);
      results.push({ rental_id: rental.rental_id, skipped: true, reason: 'invalid_email_in_db' });
      continue;
    }

    // 4. Send overdue notice email
    const emailResult = await sendOverdueNoticeEmail({
      memberName:   rental.member_name,
      memberEmail:  rental.member_email,
      membershipId: rental.membership_id,
      itemName:     rental.item_name,
      dueDate:      rental.return_due_date,
      daysOverdue
    });

    if (emailResult.success) {
      await db.run(`
        INSERT INTO email_notifications (rental_id, type, sent_at)
        VALUES ($1, 'overdue', CURRENT_DATE)
      `, [rental.rental_id]);
      console.log(`[CronService] ✅ Overdue notice sent to ${rental.member_email} for "${rental.item_name}" (${daysOverdue}d overdue)`);
    } else {
      console.error(`[CronService] ❌ Failed to send overdue notice to ${rental.member_email}: ${emailResult.error}`);
    }

    results.push({
      rental_id:      rental.rental_id,
      member_name:    rental.member_name,
      member_email:   rental.member_email,
      membership_id:  rental.membership_id,
      item_name:      rental.item_name,
      return_due_date: rental.return_due_date,
      days_overdue:   daysOverdue,
      email_sent:     emailResult.success,
      email_error:    emailResult.error || null,
      message_id:     emailResult.messageId || null
    });
  }

  console.log('[CronService] Overdue check completed.');
  return {
    checked_at:     new Date().toISOString(),
    repeat_cadence: repeatDays === 0 ? 'once' : `every_${repeatDays}_days`,
    total_overdue:  overdueRentals.length,
    results
  };
}

// ─── Cron Initializer ──────────────────────────────────────────────────────────

/**
 * Runs the overdue check immediately in the background on server startup.
 * This ensures overdue emails are dispatched right away instead of waiting
 * until the next scheduled cron window (e.g. 07:00 AM).
 *
 * Non-blocking: errors are caught and logged but never crash the server.
 */
export function runStartupOverdueCheck() {
  // Delay by 2 seconds to allow DB init and SMTP verification to settle first
  setTimeout(async () => {
    console.log('[CronService] 🚀 Startup overdue check running...');
    try {
      const result = await triggerOverdueCheck();
      console.log(`[CronService] ✅ Startup overdue check complete. Processed ${result.total_overdue} rental(s).`);
    } catch (err) {
      console.error('[CronService] ❌ Startup overdue check failed:', err.message);
    }
  }, 2000);
}

/**
 * Initialises both scheduled cron jobs.
 * Schedule is controlled by CRON_SCHEDULE in .env (default: '0 7 * * *' = 07:00 AM daily).
 * Also fires a non-blocking overdue check immediately at startup.
 */
export function initCronJobs() {
  const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';

  if (!cron.validate(schedule)) {
    console.error(`[CronService] ❌ Invalid CRON_SCHEDULE value: "${schedule}". Falling back to '0 7 * * *'.`);
  }

  const effectiveSchedule = cron.validate(schedule) ? schedule : '0 7 * * *';

  // Single daily job that runs both checks sequentially
  cron.schedule(effectiveSchedule, async () => {
    console.log(`\n[CronService] ⏰ Scheduled job fired at ${new Date().toISOString()}`);
    try {
      await triggerReminderCheck();
    } catch (err) {
      console.error('[CronService] Error in reminder check:', err);
    }
    try {
      await triggerOverdueCheck();
    } catch (err) {
      console.error('[CronService] Error in overdue check:', err);
    }
  });

  console.log(`[CronService] ✅ Daily email jobs scheduled (${effectiveSchedule}).`);
  console.log(`               • Return reminder: ${getReminderDaysBefore()} day(s) before due date`);
  console.log(`               • Overdue notices: ${getOverdueRepeatDays() === 0 ? 'send once' : `repeat every ${getOverdueRepeatDays()} day(s)`}`);

  // Fire an immediate overdue check at startup (non-blocking)
  runStartupOverdueCheck();
}
