import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
  dotenv.config({ path: path.join(__dirname, '../../.env') });
} catch (err) {
  // Ignored on serverless cloud platforms where env vars are injected directly
}

// ─── Lazy transporter ─────────────────────────────────────────────────────────
// Transporter is created on first use so that env vars are always read at
// call-time, never captured at module-load time. This also means a restart
// is not required after fixing .env values during development.

let _transporter = null;

function getTransporter() {
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host:   process.env.SMTP_HOST  || 'smtp.gmail.com',
      port:   Number(process.env.SMTP_PORT) || 587,
      secure: Number(process.env.SMTP_PORT) === 465, // true only for port 465
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }
  return _transporter;
}

// Keep the named export for the test script (scripts/test-email.js uses it directly)
export const transporter = {
  verify: () => getTransporter().verify(),
  sendMail: (opts) => getTransporter().sendMail(opts)
};

// ─── Startup SMTP verification ────────────────────────────────────────────────

/**
 * Logs a masked SMTP config summary and verifies the connection.
 * Called once at server startup so failures surface immediately.
 */
export async function verifySMTPConnection() {
  const host = process.env.SMTP_HOST  || 'smtp.gmail.com';
  const port = process.env.SMTP_PORT  || '587';
  const user = process.env.SMTP_USER  || '(not set)';
  const pass = process.env.SMTP_PASS;

  // Mask password: show first 2 and last 2 chars only
  console.log('[Mailer] ── SMTP Configuration ────────────────────────');
  console.log(`[Mailer]   Host : ${host}:${port}`);
  console.log(`[Mailer]   User : ${user}`);
  console.log(`[Mailer]   Pass : ${pass ? '(configured)' : '(not set)'}`);
  console.log('[Mailer] ────────────────────────────────────────────────');

  if (!user || user === '(not set)') {
    console.error('[Mailer] ❌ SMTP_USER is not set in .env — emails will fail.');
    return false;
  }
  if (!pass || pass.length < 8) {
    console.error('[Mailer] ❌ SMTP_PASS is missing or too short in .env — emails will fail.');
    console.error('[Mailer]    For Gmail: use a 16-character App Password with NO spaces.');
    return false;
  }

  try {
    await getTransporter().verify();
    console.log('[Mailer] ✅ SMTP connection verified — credentials OK.');
    return true;
  } catch (err) {
    console.error('[Mailer] ❌ SMTP connection FAILED:', err.message);
    console.error('[Mailer]    Error code:', err.code);
    if (err.code === 'EAUTH') {
      console.error('[Mailer]    → Gmail Auth error. Possible causes:');
      console.error('[Mailer]      1. SMTP_PASS has spaces — remove them (App Passwords are 16 chars, no spaces).');
      console.error('[Mailer]      2. Using your regular Gmail password — you must use an App Password.');
      console.error('[Mailer]      3. 2-Step Verification is not enabled on the Gmail account.');
      console.error('[Mailer]      4. App Password was revoked — generate a new one at myaccount.google.com/apppasswords.');
    } else if (err.code === 'ECONNREFUSED' || err.code === 'ETIMEDOUT') {
      console.error('[Mailer]    → Network issue — check firewall / port 587 / SMTP_HOST.');
    }
    return false;
  }
}

// ─── sendMail ─────────────────────────────────────────────────────────────────

/**
 * Generic email sending utility with full diagnostics on failure.
 */
export async function sendMail({ to, subject, text, html }) {
  // Guard: validate recipient before even trying
  if (!to || typeof to !== 'string' || !to.includes('@')) {
    console.error(`[Mailer] ❌ Invalid or missing recipient address: "${to}"`);
    return { success: false, error: `Invalid recipient address: "${to}"` };
  }

  const from = `"IEEE MACE SB" <${process.env.SMTP_USER || 'no-reply@ieee.org'}>`;

  console.log(`[Mailer] 📤 Attempting to send email:`);
  console.log(`[Mailer]    To      : ${to}`);
  console.log(`[Mailer]    Subject : ${subject}`);
  console.log(`[Mailer]    From    : ${from}`);

  const mailOptions = { from, to, subject, text, html };

  try {
    const info = await getTransporter().sendMail(mailOptions);
    console.log(`[Mailer] ✅ Email delivered to ${to} | Message-ID: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    // Log the full error object — not just error.message — so auth codes are visible
    console.error(`[Mailer] ❌ Failed to send email to "${to}"`);
    console.error(`[Mailer]    Code    : ${error.code || 'N/A'}`);
    console.error(`[Mailer]    Message : ${error.message}`);
    console.error(`[Mailer]    Response: ${error.response || 'N/A'}`);
    if (error.code === 'EAUTH') {
      console.error('[Mailer]    → Fix: Check SMTP_USER and SMTP_PASS in .env (Gmail App Password, no spaces).');
    }
    return { success: false, error: error.message, code: error.code };
  }
}

// ─── sendAdminNotification ────────────────────────────────────────────────────

/**
 * Send notification email to the configured Admin email address.
 */
export async function sendAdminNotification({ subject, text, html }) {
  const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
  if (!adminEmail) {
    console.error('[Mailer] ❌ No ADMIN_EMAIL or SMTP_USER configured in .env');
    return { success: false, error: 'No admin recipient email configured' };
  }
  return sendMail({ to: adminEmail, subject, text, html });
}
