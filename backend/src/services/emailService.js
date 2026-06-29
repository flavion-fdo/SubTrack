const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const logFilePath = path.resolve(__dirname, '../../../alerts.log');

// Setup transporter based on env variables
let transporter = null;

if (process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_PORT === '465',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  console.log('Nodemailer SMTP configured.');
} else {
  console.log('Nodemailer SMTP not fully configured. Emails will be logged to console and alerts.log.');
}

/**
 * Send subscription renewal alert email
 * @param {string} toEmail - User email
 * @param {object} subscription - Subscription details (service_name, cost, billing_cycle, next_renewal_date)
 */
exports.sendRenewalAlert = async (toEmail, subscription) => {
  const { service_name, cost, billing_cycle, next_renewal_date, alert_days_before, alert_type } = subscription;
  const renewalDateObj = new Date(next_renewal_date);
  const formattedDate = renewalDateObj.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  let subject, textContent, htmlContent;

  if (alert_type === 'one_hour') {
    subject = `SubTrack Final Reminder: Your ${service_name} subscription renews in 1 hour!`;
    
    textContent = `
Hello,

This is a final reminder that your subscription for ${service_name} will renew in 1 hour (at midnight on ${formattedDate}).

Details:
- Service: ${service_name}
- Cost: $${cost.toFixed(2)} (${billing_cycle})
- Renewal Date: ${formattedDate} (midnight)

Please make sure your payment details are up to date or cancel the subscription if you no longer wish to continue.

Best regards,
SubTrack Alert Engine
    `;

    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #ef4444; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-top: 0;">SubTrack Final Renewal Alert</h2>
        <p>Hello,</p>
        <p>This is a final reminder that your subscription for <strong>${service_name}</strong> will renew in <strong>1 hour</strong>.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Service:</td>
              <td style="padding: 5px 0; color: #0f172a;">${service_name}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Cost:</td>
              <td style="padding: 5px 0; color: #0f172a;">$${cost.toFixed(2)} (${billing_cycle})</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Renewal Date:</td>
              <td style="padding: 5px 0; color: #0f172a;">${formattedDate} (midnight)</td>
            </tr>
          </table>
        </div>

        <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
          Make sure your payment details are up-to-date, or cancel the subscription if you no longer wish to continue.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          Sent automatically by SubTrack Alert Engine.
        </p>
      </div>
    `;
  } else {
    const daysBefore = alert_days_before !== undefined ? alert_days_before : 3;
    const daysText = daysBefore === 0 ? 'today' : (daysBefore === 1 ? '1 day' : `${daysBefore} days`);
    subject = `SubTrack Alert: Your ${service_name} subscription renews in ${daysText}!`;
    
    textContent = `
Hello,

This is a reminder that your subscription for ${service_name} will renew in ${daysText} on ${formattedDate} (${next_renewal_date}).

Details:
- Service: ${service_name}
- Cost: $${cost.toFixed(2)} (${billing_cycle})
- Renewal Date: ${formattedDate}

Please make sure your payment details are up to date or cancel the subscription if you no longer wish to continue.

Best regards,
SubTrack Alert Engine
    `;

    htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; margin-top: 0;">SubTrack Renewal Alert</h2>
        <p>Hello,</p>
        <p>This is a reminder that your subscription for <strong>${service_name}</strong> will renew in <strong>${daysText}</strong>.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0; border-left: 4px solid #4f46e5;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Service:</td>
              <td style="padding: 5px 0; color: #0f172a;">${service_name}</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Cost:</td>
              <td style="padding: 5px 0; color: #0f172a;">$${cost.toFixed(2)} (${billing_cycle})</td>
            </tr>
            <tr>
              <td style="padding: 5px 0; font-weight: bold; color: #475569;">Renewal Date:</td>
              <td style="padding: 5px 0; color: #0f172a;">${formattedDate}</td>
            </tr>
          </table>
        </div>

        <p style="color: #64748b; font-size: 14px; margin-top: 25px;">
          Make sure your payment details are up-to-date, or cancel the subscription if you no longer wish to continue.
        </p>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 25px 0;" />
        <p style="color: #94a3b8; font-size: 12px; text-align: center;">
          Sent automatically by SubTrack Alert Engine.
        </p>
      </div>
    `;
  }

  if (transporter) {
    try {
      const fromEmail = process.env.EMAIL_FROM || 'noreply@subtrack.com';
      await transporter.sendMail({
        from: fromEmail,
        to: toEmail,
        subject: subject,
        text: textContent,
        html: htmlContent
      });
      console.log(`Email alert successfully sent via SMTP to: ${toEmail} for service: ${service_name}`);
      return true;
    } catch (error) {
      console.error(`Failed to send email alert via SMTP to ${toEmail}:`, error);
      // Fallback to logging
    }
  }

  // Fallback logging
  const logMessage = `
========================================
TIMESTAMP: ${new Date().toISOString()}
TO: ${toEmail}
SUBJECT: ${subject}
BODY:
${textContent}
========================================
\n`;

  try {
    fs.appendFileSync(logFilePath, logMessage, 'utf8');
    console.log(`[MOCK EMAIL] Alert logged to alerts.log for: ${toEmail} (${service_name})`);
    return true;
  } catch (error) {
    console.error('Failed to write mock email to alerts.log:', error);
    return false;
  }
};
