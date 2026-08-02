import { sendMail, sendAdminNotification } from '../utils/mailer.js';

/**
 * Send a rental confirmation email to the member when a new rental is issued.
 */
export async function sendRentalConfirmationEmail({ memberName, memberEmail, membershipId, itemName, quantity, dateIssued, dueDate }) {
  const subject = `Rental Confirmation: ${itemName} borrowed from IEEE Lab`;

  const text =
    `Dear ${memberName},\n\n` +
    `Your rental of the following component has been successfully recorded in the IEEE Lab system.\n\n` +
    `  Component : ${itemName}\n` +
    `  Quantity  : ${quantity}\n` +
    `  Issued On : ${dateIssued}\n` +
    `  Due Date  : ${dueDate}\n` +
    `  Member ID : ${membershipId}\n\n` +
    `Please return it to the IEEE Component Lab on or before the due date.\n\n` +
    `Thank you!\n` +
    `IEEE Student Branch — Inventory & Component Lab`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #006699, #0088cc); color: white; padding: 18px 20px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">IEEE Student Branch</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Rental Confirmation Notice</p>
      </div>

      <div style="padding: 24px 20px; color: #2d3748;">
        <p style="margin: 0 0 16px 0;">Dear <strong>${memberName}</strong>,</p>
        <p style="margin: 0 0 16px 0;">
          Your equipment rental has been successfully recorded in the IEEE Lab system.
        </p>

        <div style="background-color: #ebf8ff; border: 1px solid #90cdf4; border-left: 4px solid #3182ce; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #2b6cb0;">📋 Rental Summary</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096; width: 38%;">Component Name</td>
              <td style="padding: 5px 0; color: #2d3748; font-weight: bold;">${itemName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Quantity Borrowed</td>
              <td style="padding: 5px 0; color: #2d3748; font-weight: bold;">${quantity}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Date Issued</td>
              <td style="padding: 5px 0; color: #2d3748;">${dateIssued}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Return Due Date</td>
              <td style="padding: 5px 0; color: #c05621; font-weight: bold;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Membership ID</td>
              <td style="padding: 5px 0; color: #2d3748; font-family: monospace;">${membershipId}</td>
            </tr>
          </table>
        </div>

        <p style="margin: 0; font-size: 14px; color: #4a5568;">Please return the component on or before the due date.</p>
      </div>

      <div style="background-color: #f7fafc; padding: 12px; text-align: center; font-size: 12px; color: #a0aec0; border-radius: 0 0 6px 6px; border-top: 1px solid #e2e8f0;">
        IEEE Student Branch • Inventory &amp; Component Lab
      </div>
    </div>
  `;

  return sendMail({ to: memberEmail, subject, text, html });
}

/**
 * Send a return reminder email to the member N days before the due date.
 * (N is configurable via REMINDER_DAYS_BEFORE in .env, default: 1)
 */
export async function sendReturnReminderEmail({ memberName, memberEmail, membershipId, itemName, quantity, dateIssued, dueDate }) {
  const subject = `Reminder: Return ${itemName} by ${dueDate}`;

  const text =
    `Dear ${memberName},\n\n` +
    `This is a friendly reminder that the following component is due for return soon.\n\n` +
    `  Component : ${itemName}\n` +
    `  Quantity  : ${quantity}\n` +
    `  Issued On : ${dateIssued}\n` +
    `  Due Date  : ${dueDate}\n` +
    `  Member ID : ${membershipId}\n\n` +
    `Please return it to the IEEE Component Lab on or before the due date so other members can access it.\n\n` +
    `Thank you for your cooperation!\n` +
    `IEEE Student Branch — Inventory & Component Lab`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #006699, #0088cc); color: white; padding: 18px 20px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">IEEE Student Branch</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Inventory &amp; Component Lab</p>
      </div>

      <!-- Body -->
      <div style="padding: 24px 20px; color: #2d3748;">
        <p style="margin: 0 0 16px 0;">Dear <strong>${memberName}</strong>,</p>
        <p style="margin: 0 0 16px 0;">
          This is a <strong>friendly reminder</strong> that the component you borrowed is due for return
          on <span style="color: #c05621; font-weight: bold;">${dueDate}</span>. Please ensure it is returned on time
          so that other members can access it.
        </p>

        <!-- Details Card -->
        <div style="background-color: #fffbeb; border: 1px solid #f6ad55; border-left: 4px solid #dd6b20; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #744210;">📦 Component Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096; width: 38%;">Component Name</td>
              <td style="padding: 5px 0; color: #2d3748; font-weight: bold;">${itemName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Quantity Borrowed</td>
              <td style="padding: 5px 0; color: #2d3748; font-weight: bold;">${quantity}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Date Issued</td>
              <td style="padding: 5px 0; color: #2d3748;">${dateIssued}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Return Due Date</td>
              <td style="padding: 5px 0; color: #c05621; font-weight: bold;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Membership ID</td>
              <td style="padding: 5px 0; color: #2d3748; font-family: monospace;">${membershipId}</td>
            </tr>
          </table>
        </div>

        <p style="margin: 0 0 8px 0; font-size: 14px; color: #4a5568;">
          Please return the component to the <strong>IEEE Component Lab</strong> on or before the due date.
        </p>
        <p style="margin: 0; font-size: 14px; color: #4a5568;">Thank you for being a responsible member! 🙏</p>
      </div>

      <!-- Footer -->
      <div style="background-color: #f7fafc; padding: 12px; text-align: center; font-size: 12px; color: #a0aec0; border-radius: 0 0 6px 6px; border-top: 1px solid #e2e8f0;">
        IEEE Student Branch • Inventory &amp; Component Lab &nbsp;|&nbsp; This is an automated notification.
      </div>
    </div>
  `;

  const result = await sendMail({ to: memberEmail, subject, text, html });

  // Admin copy
  await sendAdminNotification({
    subject: `[ADMIN COPY] Reminder Sent: ${itemName} due ${dueDate} (${membershipId})`,
    text: `Return reminder dispatched to ${memberName} (${memberEmail}) for "${itemName}" x${quantity}. Due: ${dueDate}.`,
    html: `<p><strong>Admin Copy:</strong> Return reminder sent to ${memberName} (<code>${memberEmail}</code>) for <strong>${itemName}</strong> x${quantity} (ID: <code>${membershipId}</code>). Due: <strong>${dueDate}</strong>.</p>`
  });

  return result;
}

/**
 * Send an overdue notice email to the member after the due date has passed.
 * Includes a days-overdue count and an urgent return request.
 */
export async function sendOverdueNoticeEmail({ memberName, memberEmail, membershipId, itemName, dueDate, daysOverdue }) {
  const subject = `Overdue: ${itemName} was due on ${dueDate}`;
  const dayWord = daysOverdue !== 1 ? 'days' : 'day';

  const text =
    `Dear ${memberName},\n\n` +
    `The following component is now OVERDUE by ${daysOverdue} ${dayWord}. Please return it immediately.\n\n` +
    `  Component    : ${itemName}\n` +
    `  Due Date     : ${dueDate}\n` +
    `  Days Overdue : ${daysOverdue}\n` +
    `  Member ID    : ${membershipId}\n\n` +
    `Prompt return is essential so that other members can access lab resources.\n` +
    `If you have already returned it, please disregard this notice.\n\n` +
    `IEEE Student Branch — Inventory & Component Lab`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <!-- Header -->
      <div style="background: linear-gradient(135deg, #c53030, #e53e3e); color: white; padding: 18px 20px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0; font-size: 20px;">IEEE Student Branch</h2>
        <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">Overdue Component Notice</p>
      </div>

      <!-- Body -->
      <div style="padding: 24px 20px; color: #2d3748;">
        <p style="margin: 0 0 16px 0;">Dear <strong>${memberName}</strong>,</p>
        <p style="margin: 0 0 16px 0;">
          Our records show that the component you borrowed has <strong style="color: #c53030;">not been returned</strong>
          and is now past its due date. Please return it to the IEEE Component Lab <strong>immediately</strong>.
        </p>

        <!-- Overdue Badge -->
        <div style="text-align: center; margin: 20px 0;">
          <span style="display: inline-block; background-color: #fff5f5; border: 2px solid #fc8181; border-radius: 50px; padding: 8px 24px; font-size: 15px; font-weight: bold; color: #c53030;">
            ⚠️ Overdue by ${daysOverdue} ${dayWord}
          </span>
        </div>

        <!-- Details Card -->
        <div style="background-color: #fff5f5; border: 1px solid #fc8181; border-left: 4px solid #e53e3e; border-radius: 6px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; font-size: 14px; font-weight: bold; color: #742a2a;">📋 Overdue Item Details</p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096; width: 38%;">Component Name</td>
              <td style="padding: 5px 0; color: #2d3748; font-weight: bold;">${itemName}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Return Was Due On</td>
              <td style="padding: 5px 0; color: #c53030; font-weight: bold;">${dueDate}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Days Overdue</td>
              <td style="padding: 5px 0; color: #c53030; font-weight: bold;">${daysOverdue} ${dayWord}</td>
            </tr>
            <tr>
              <td style="padding: 5px 8px 5px 0; color: #718096;">Membership ID</td>
              <td style="padding: 5px 0; color: #2d3748; font-family: monospace;">${membershipId}</td>
            </tr>
          </table>
        </div>

        <p style="margin: 0 0 8px 0; font-size: 14px; color: #4a5568;">
          Please return the component to the <strong>IEEE Component Lab</strong> as soon as possible.
          Timely returns allow all members to benefit from shared lab resources.
        </p>
        <p style="margin: 0; font-size: 13px; color: #a0aec0; font-style: italic;">
          If you have already returned this component, please disregard this notice.
        </p>
      </div>

      <!-- Footer -->
      <div style="background-color: #fff5f5; padding: 12px; text-align: center; font-size: 12px; color: #a0aec0; border-radius: 0 0 6px 6px; border-top: 1px solid #fed7d7;">
        IEEE Student Branch • Inventory &amp; Component Lab &nbsp;|&nbsp; This is an automated notification.
      </div>
    </div>
  `;

  const result = await sendMail({ to: memberEmail, subject, text, html });

  // Admin copy
  await sendAdminNotification({
    subject: `[ADMIN COPY] Overdue Notice Sent: ${itemName} (${daysOverdue}d overdue, ${membershipId})`,
    text: `Overdue notice sent to ${memberName} (${memberEmail}) for "${itemName}". Due: ${dueDate}. Days overdue: ${daysOverdue}.`,
    html: `<p><strong>Admin Copy:</strong> Overdue notice sent to ${memberName} (<code>${memberEmail}</code>) for <strong>${itemName}</strong> (ID: <code>${membershipId}</code>). Due: <strong>${dueDate}</strong>. Overdue by <strong>${daysOverdue} ${dayWord}</strong>.</p>`
  });

  return result;
}

/**
 * Send overdue rental alert to member and optionally copy admin.
 * @deprecated Use sendOverdueNoticeEmail for the automated cron logic.
 */
export async function sendOverdueNotificationEmail({ memberName, memberEmail, membershipId, itemName, returnDueDate }) {
  const subject = `[OVERDUE RENTAL NOTICE] Action Required: Return ${itemName}`;
  const text = `Dear ${memberName},\n\nPlease return the item "${itemName}". The expected return due date (${returnDueDate}) has arrived/passed.\nYour Registered Membership ID: ${membershipId}\n\nThank you,\nIEEE Student Branch Inventory Team`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="background-color: #006699; color: white; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0;">IEEE Student Branch</h2>
        <p style="margin: 5px 0 0 0; font-size: 14px;">Inventory Rental Overdue Alert</p>
      </div>
      <div style="padding: 20px; color: #2d3748;">
        <p>Dear <strong>${memberName}</strong>,</p>
        <p>This is an automated notification regarding your physical item rental from the IEEE Inventory.</p>
        <div style="background-color: #fff5f5; border-left: 4px solid #e53e3e; padding: 12px; margin: 15px 0;">
          <p style="margin: 0; color: #9b2c2c;"><strong>Overdue Item:</strong> ${itemName}</p>
          <p style="margin: 4px 0 0 0; color: #9b2c2c;"><strong>Expected Return Due Date:</strong> ${returnDueDate}</p>
          <p style="margin: 4px 0 0 0; color: #9b2c2c;"><strong>Membership ID:</strong> ${membershipId}</p>
        </div>
        <p>Please return <strong>${itemName}</strong> to the IEEE lab as soon as possible so other members can use it.</p>
        <p>Thank you for your cooperation!</p>
      </div>
      <div style="background-color: #f7fafc; padding: 10px; text-align: center; font-size: 12px; color: #718096; border-radius: 0 0 6px 6px;">
        IEEE Student Branch • Inventory &amp; Component Lab
      </div>
    </div>
  `;

  const result = await sendMail({ to: memberEmail, subject, text, html });

  await sendAdminNotification({
    subject: `[ADMIN COPY] Overdue Notice Sent: ${itemName} (${membershipId})`,
    text: `Overdue reminder sent to ${memberName} (${memberEmail}) for item "${itemName}". Due date was ${returnDueDate}.`,
    html: `<p><strong>Admin Copy:</strong> Overdue reminder dispatched to ${memberName} (${memberEmail}) for item <strong>${itemName}</strong> (Membership ID: <code>${membershipId}</code>).</p>`
  });

  return result;
}

/**
 * Send low-stock alert to Admin when item available stock drops to 0 or threshold
 */
export async function sendLowStockAdminAlert({ itemName, category, availableQty, totalQty }) {
  const subject = `[LOW STOCK ALERT] Item "${itemName}" is Out of Stock!`;
  const text = `Low Stock Alert:\nItem "${itemName}" (${category}) has reached ${availableQty} available units out of ${totalQty} total units. Please consider restocking or processing pending returns.\n\nIEEE Inventory System`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <div style="background-color: #dd6b20; color: white; padding: 15px; border-radius: 6px 6px 0 0; text-align: center;">
        <h2 style="margin: 0;">IEEE Lab Stock Warning</h2>
      </div>
      <div style="padding: 20px; color: #2d3748;">
        <h3 style="color: #c05621;">Out of Stock Alert</h3>
        <p>The inventory item <strong>${itemName}</strong> (${category}) is now out of stock.</p>
        <ul>
          <li><strong>Available Quantity:</strong> ${availableQty}</li>
          <li><strong>Total Owned Units:</strong> ${totalQty}</li>
        </ul>
        <p>Please check active rentals or restock items to maintain lab availability.</p>
      </div>
    </div>
  `;

  return sendAdminNotification({ subject, text, html });
}
