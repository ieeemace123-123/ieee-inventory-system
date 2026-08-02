/**
 * scripts/diagnose-email.js
 *
 * Standalone diagnostic script that checks every layer of the email system:
 *   1. Env vars loaded & valid
 *   2. SMTP connection & credentials
 *   3. Database query — fetches due-tomorrow and overdue rentals with emails
 *   4. End-to-end test send to admin
 *
 * Run with:  node scripts/diagnose-email.js
 */

import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDbClient, initDb } from '../src/db/database.js';
import { getTodayStr } from '../src/utils/dateUtils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

// ── Helpers ──────────────────────────────────────────────────────────────────

const pass = (msg) => console.log(`  ✅ ${msg}`);
const fail = (msg) => console.error(`  ❌ ${msg}`);
const info = (msg) => console.log(`  ℹ️  ${msg}`);
const warn = (msg) => console.warn(`  ⚠️  ${msg}`);
const header = (msg) => console.log(`\n${'─'.repeat(60)}\n  ${msg}\n${'─'.repeat(60)}`);

async function runDiagnosis() {
  // ── 1. Environment Variables ──────────────────────────────────────────────────

  header('CHECK 1 — Environment Variables');

  const SMTP_HOST = process.env.SMTP_HOST;
  const SMTP_PORT = process.env.SMTP_PORT;
  const SMTP_USER = process.env.SMTP_USER;
  const SMTP_PASS = process.env.SMTP_PASS;
  const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
  const REMINDER_DAYS_BEFORE = process.env.REMINDER_DAYS_BEFORE;
  const OVERDUE_REPEAT = process.env.OVERDUE_REPEAT_EVERY_DAYS;
  const CRON_SCHEDULE = process.env.CRON_SCHEDULE;

  const maskPass = (p) => p ? `${p.slice(0, 2)}${'*'.repeat(Math.max(0, p.length - 4))}${p.slice(-2)} (len=${p.length})` : '(not set)';

  info(`SMTP_HOST              = ${SMTP_HOST || '(not set)'}`);
  info(`SMTP_PORT              = ${SMTP_PORT || '(not set)'}`);
  info(`SMTP_USER              = ${SMTP_USER || '(not set)'}`);
  info(`SMTP_PASS              = ${maskPass(SMTP_PASS)}`);
  info(`ADMIN_EMAIL            = ${ADMIN_EMAIL || '(not set)'}`);
  info(`REMINDER_DAYS_BEFORE   = ${REMINDER_DAYS_BEFORE || '(not set, will default to 1)'}`);
  info(`OVERDUE_REPEAT_EVERY_DAYS = ${OVERDUE_REPEAT || '(not set, will default to 0)'}`);
  info(`CRON_SCHEDULE          = ${CRON_SCHEDULE || '(not set, will default to 0 7 * * *)'}`);

  let envOk = true;

  if (!SMTP_USER) { fail('SMTP_USER is not set'); envOk = false; }
  else pass(`SMTP_USER is set: ${SMTP_USER}`);

  if (!SMTP_PASS) { fail('SMTP_PASS is not set'); envOk = false; }
  else if (SMTP_PASS.includes(' ')) {
    fail(`SMTP_PASS contains SPACES (length=${SMTP_PASS.length}). Gmail App Passwords must have no spaces.`);
    fail('  Fix: remove all spaces from SMTP_PASS in your .env file.');
    envOk = false;
  } else if (SMTP_PASS.length !== 16) {
    warn(`SMTP_PASS length is ${SMTP_PASS.length} (expected 16 for a Gmail App Password)`);
  } else {
    pass(`SMTP_PASS looks correct (16 chars, no spaces)`);
  }

  if (!ADMIN_EMAIL) warn('ADMIN_EMAIL not set — admin copies will fall back to SMTP_USER');
  else pass(`ADMIN_EMAIL is set: ${ADMIN_EMAIL}`);

  // ── 2. SMTP Connection ────────────────────────────────────────────────────────

  header('CHECK 2 — SMTP Connection');

  if (!envOk) {
    fail('Skipping SMTP check due to env variable issues above.');
  } else {
    const transporter = nodemailer.createTransport({
      host:   SMTP_HOST   || 'smtp.gmail.com',
      port:   Number(SMTP_PORT) || 587,
      secure: Number(SMTP_PORT) === 465,
      auth:   { user: SMTP_USER, pass: SMTP_PASS }
    });

    try {
      await transporter.verify();
      pass('SMTP connection verified — credentials are accepted by Gmail.');

      // ── 3. Test email send ────────────────────────────────────────────────

      header('CHECK 3 — Test Email Send (to Admin)');
      const recipient = ADMIN_EMAIL || SMTP_USER;
      info(`Sending test email to: ${recipient}`);

      try {
        const info2 = await transporter.sendMail({
          from:    `"IEEE Diagnose Script" <${SMTP_USER}>`,
          to:      recipient,
          subject: '🔍 IEEE Email Diagnostic — SMTP Working',
          text:    `This test was sent at ${new Date().toISOString()} by diagnose-email.js to confirm SMTP is working.`,
          html:    `<div style="font-family:sans-serif;padding:20px;border:1px solid #e2e8f0;border-radius:8px;">
                      <h2 style="color:#006699;">IEEE Inventory — Email Diagnostic</h2>
                      <p style="color:#2e8b57;font-weight:bold;">✅ SMTP is working correctly!</p>
                      <p>Sent at: <code>${new Date().toISOString()}</code></p>
                      <p>Recipient: <code>${recipient}</code></p>
                      <p>Host: <code>${SMTP_HOST}:${SMTP_PORT}</code></p>
                    </div>`
        });
        pass(`Test email sent! Message-ID: ${info2.messageId}`);
      } catch (sendErr) {
        fail(`Test email FAILED: ${sendErr.message}`);
        fail(`  Code: ${sendErr.code} | Response: ${sendErr.response}`);
      }

    } catch (err) {
      fail(`SMTP verification FAILED: ${err.message}`);
      fail(`  Code: ${err.code}`);

      if (err.code === 'EAUTH') {
        fail('→ Gmail rejected the credentials. Common causes:');
        fail('  • SMTP_PASS has spaces — Gmail App Passwords must be 16 chars with NO spaces.');
        fail('  • Using regular Gmail password — you must generate an App Password.');
        fail('  • 2-Step Verification is OFF — enable it at myaccount.google.com/security.');
        fail('  • App Password was deleted/revoked — generate a new one at myaccount.google.com/apppasswords.');
        fail('  • Wrong account — SMTP_USER must be the Gmail account the App Password was created for.');
      } else if (err.code === 'ECONNREFUSED') {
        fail('→ Connection refused. Check SMTP_HOST and SMTP_PORT.');
      } else if (err.code === 'ETIMEDOUT') {
        fail('→ Connection timed out. Check firewall / network / port 587.');
      }
    }
  }

  // ── 4. Database Query Check ───────────────────────────────────────────────────

  header('CHECK 4 — Database Query (Reminder + Overdue Records)');

  await initDb();
  const db = getDbClient();
  const now = new Date();
  const todayStr = getTodayStr(now);
  const reminderDays = parseInt(REMINDER_DAYS_BEFORE, 10) || 1;

  const reminderTargetDate = new Date(now);
  reminderTargetDate.setDate(now.getDate() + reminderDays);
  const reminderTargetStr = getTodayStr(reminderTargetDate);

  // Due-in-N-days reminder query
  info(`\n  Checking for rentals due in ${reminderDays} day(s) (return reminders):`);
  const reminders = await db.all(`
    SELECT r.id AS rental_id, r.return_due_date, r.quantity,
           m.name AS member_name, m.email AS member_email, m.membership_id,
           i.name AS item_name
    FROM rentals r
    JOIN members m ON r.member_id = m.id
    JOIN items   i ON r.item_id   = i.id
    WHERE r.date_returned IS NULL
      AND r.return_due_date = $1
  `, [reminderTargetStr]);

  if (reminders.length === 0) {
    warn(`  No rentals found due in ${reminderDays} day(s). Reminder emails won't fire today.`);
    warn(`  (This is normal — it means no one's due date is exactly ${reminderDays} day(s) away.)`);
  } else {
    pass(`  Found ${reminders.length} reminder candidate(s):`);
    for (const r of reminders) {
      const emailOk = r.member_email && r.member_email.includes('@');
      console.log(`    Rental #${r.rental_id} | ${r.member_name} | Email: "${r.member_email}" ${emailOk ? '✅' : '❌ INVALID'} | Item: ${r.item_name} | Due: ${r.return_due_date}`);
    }
  }

  // Overdue query
  info(`\n  Checking for overdue rentals (overdue notices):`);
  const overdues = await db.all(`
    SELECT r.id AS rental_id, r.return_due_date, r.quantity, r.status,
           m.name AS member_name, m.email AS member_email, m.membership_id,
           i.name AS item_name
    FROM rentals r
    JOIN members m ON r.member_id = m.id
    JOIN items   i ON r.item_id   = i.id
    WHERE r.date_returned IS NULL
      AND r.return_due_date < $1
  `, [todayStr]);

  if (overdues.length === 0) {
    warn('  No overdue rentals found. Overdue emails won\'t fire today.');
  } else {
    pass(`  Found ${overdues.length} overdue rental(s):`);
    for (const r of overdues) {
      const daysOverdue = Math.floor((new Date(todayStr) - new Date(r.return_due_date)) / 86400000);
      const emailOk = r.member_email && r.member_email.includes('@');
      console.log(`    Rental #${r.rental_id} | ${r.member_name} | Email: "${r.member_email}" ${emailOk ? '✅' : '❌ INVALID'} | Item: ${r.item_name} | Overdue: ${daysOverdue}d`);
    }
  }

  // Check email_notifications table exists
  info('\n  Checking email_notifications table:');
  const tableExists = await db.get(`
    SELECT table_name FROM information_schema.tables WHERE table_name='email_notifications'
  `);
  if (tableExists) {
    const notifCount = await db.get('SELECT COUNT(*) as count FROM email_notifications');
    pass(`  email_notifications table exists with ${notifCount.count} row(s).`);
  } else {
    fail('  email_notifications table DOES NOT EXIST — restart the server to create it via initDb().');
  }

  // ── Summary ───────────────────────────────────────────────────────────────────

  header('DIAGNOSTIC COMPLETE');
  console.log('  If all checks above passed, your email system is correctly configured.');
  console.log('  To manually trigger emails right now (no need to wait for 7AM cron):');
  console.log('    POST http://localhost:5000/api/rentals/cron-trigger   (runs both checks)');
  console.log('    POST http://localhost:5000/api/rentals/reminder-trigger (reminders only)');
  console.log('  Make sure to include your Admin JWT token in the Authorization header.\n');

  process.exit(0);
}

runDiagnosis().catch(err => {
  console.error('Diagnostic failed:', err);
  process.exit(1);
});
