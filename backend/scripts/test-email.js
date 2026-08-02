import { sendMail, sendAdminNotification, transporter } from '../src/utils/mailer.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

async function runEmailTest() {
  console.log('===================================================');
  console.log('📧 Testing Nodemailer Gmail SMTP Setup');
  console.log('===================================================');
  console.log(`SMTP Host: ${process.env.SMTP_HOST || 'smtp.gmail.com'}`);
  console.log(`SMTP Port: ${process.env.SMTP_PORT || 587}`);
  console.log(`SMTP User: ${process.env.SMTP_USER || 'Not set'}`);
  console.log(`Admin Email: ${process.env.ADMIN_EMAIL || 'Not set'}`);

  if (!process.env.SMTP_USER || !process.env.SMTP_PASS || process.env.SMTP_PASS === 'YOUR_16_DIGIT_GMAIL_APP_PASSWORD') {
    console.log('\n⚠️ WARNING: SMTP_PASS in backend/.env is not set to a valid 16-digit Gmail App Password yet!');
    console.log('Please follow the Gmail App Password generation steps, replace SMTP_PASS in backend/.env, and re-run this script.\n');
  }

  // Verify SMTP Connection first
  console.log('\n1. Verifying SMTP Transporter Connection...');
  try {
    await transporter.verify();
    console.log('✅ Transporter connection verification SUCCESSFUL!');
  } catch (error) {
    console.error('❌ Transporter connection failed:', error.message);
    console.log('Please check your SMTP_USER and 16-character Gmail App Password in .env');
    return;
  }

  // Send Test Email to Admin
  console.log('\n2. Attempting to send test email to Admin...');
  const testResult = await sendAdminNotification({
    subject: '🧪 IEEE Inventory System - SMTP Verification Test',
    text: 'Hello Admin!\n\nThis is a test notification confirming that your Nodemailer Gmail SMTP setup is fully functional.',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #006699;">IEEE Inventory Rental System</h2>
        <p style="color: #2e8b57; font-weight: bold;">✅ SMTP Email Test Successful!</p>
        <p>Your Nodemailer integration using <code>smtp.gmail.com</code> is correctly configured and working.</p>
        <hr style="border: 0; border-top: 1px solid #eee;" />
        <p style="font-size: 12px; color: #777;">Sent at: ${new Date().toLocaleString()}</p>
      </div>
    `
  });

  if (testResult.success) {
    console.log(`🎉 Success! Test email dispatched. Message ID: ${testResult.messageId}`);
  } else {
    console.error('❌ Test email dispatch failed:', testResult.error);
  }
}

runEmailTest();
