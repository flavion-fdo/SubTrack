const cron = require('node-cron');
const { dbAll, dbRun } = require('../config/db');
const { sendRenewalAlert } = require('./emailService');

// Function to calculate date string for exactly N days from now
const getFutureDateString = (daysAhead) => {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysAhead);
  
  const year = targetDate.getFullYear();
  const month = String(targetDate.getMonth() + 1).padStart(2, '0');
  const day = String(targetDate.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
};

// Check for custom day renewal alerts (e.g. s.alert_days_before days away)
const checkCustomAlerts = async () => {
  console.log('Alert Engine: Running custom renewal alert checks...');
  try {
    // Query subscriptions that haven't had a custom alert sent for their next renewal date
    const subscriptions = await dbAll(
      `SELECT s.*, u.email as user_email
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN alert_history ah ON s.id = ah.subscription_id 
                                 AND s.next_renewal_date = ah.renewal_date 
                                 AND ah.alert_type = 'custom'
       WHERE ah.id IS NULL`
    );

    let sentCount = 0;
    for (const sub of subscriptions) {
      // Each subscription can choose its own day offset (alert_days_before)
      const targetDateString = getFutureDateString(sub.alert_days_before);
      
      if (sub.next_renewal_date === targetDateString) {
        console.log(`Alert Engine (Custom): Sending ${sub.alert_days_before}-day alert to ${sub.user_email} for service: ${sub.service_name}`);
        
        const emailSent = await sendRenewalAlert(sub.user_email, {
          service_name: sub.service_name,
          cost: sub.cost,
          billing_cycle: sub.billing_cycle,
          next_renewal_date: sub.next_renewal_date,
          alert_days_before: sub.alert_days_before,
          alert_type: 'custom'
        });

        if (emailSent) {
          await dbRun(
            "INSERT INTO alert_history (subscription_id, renewal_date, alert_type) VALUES (?, ?, 'custom')",
            [sub.id, sub.next_renewal_date]
          );
          sentCount++;
        }
      }
    }
    console.log(`Alert Engine: Custom renewal alert checks completed. Sent ${sentCount} alert(s).`);
  } catch (error) {
    console.error('Alert Engine Error: Failed to run custom renewal checks:', error);
  }
};

// Check for subscriptions due in 1 hour (runs daily at 23:00 / 11:00 PM)
const checkOneHourAlerts = async (force = false) => {
  const currentHour = new Date().getHours();
  if (currentHour !== 23 && !force) {
    return;
  }

  console.log('Alert Engine: Running check for subscriptions due in 1 hour...');
  const targetDateString = getFutureDateString(1); // Renewing tomorrow

  try {
    // Query subscriptions renewing tomorrow that haven't had a one_hour alert sent
    const pendingAlerts = await dbAll(
      `SELECT s.*, u.email as user_email
       FROM subscriptions s
       JOIN users u ON s.user_id = u.id
       LEFT JOIN alert_history ah ON s.id = ah.subscription_id 
                                 AND s.next_renewal_date = ah.renewal_date 
                                 AND ah.alert_type = 'one_hour'
       WHERE s.next_renewal_date = ?
         AND ah.id IS NULL`,
      [targetDateString]
    );

    console.log(`Alert Engine: Found ${pendingAlerts.length} pending 1-hour renewal alert(s).`);

    for (const sub of pendingAlerts) {
      console.log(`Alert Engine (One Hour): Sending final 1-hour alert to ${sub.user_email} for service: ${sub.service_name}`);
      
      const emailSent = await sendRenewalAlert(sub.user_email, {
        service_name: sub.service_name,
        cost: sub.cost,
        billing_cycle: sub.billing_cycle,
        next_renewal_date: sub.next_renewal_date,
        alert_days_before: sub.alert_days_before,
        alert_type: 'one_hour'
      });

      if (emailSent) {
        await dbRun(
          "INSERT INTO alert_history (subscription_id, renewal_date, alert_type) VALUES (?, ?, 'one_hour')",
          [sub.id, sub.next_renewal_date]
        );
      }
    }
    console.log('Alert Engine: 1-hour renewal alert check completed.');
  } catch (error) {
    console.error('Alert Engine Error: Failed to run 1-hour renewal checks:', error);
  }
};

// Combined method exported for testing or manual triggers
const checkRenewals = async () => {
  console.log('Alert Engine: Running combined renewal checks...');
  await checkCustomAlerts();
  await checkOneHourAlerts();
};

// Setup background cron job to run every hour at minute 0
const startAlertEngine = () => {
  // Cron: '0 * * * *' -> Runs every hour at the top of the hour
  cron.schedule('0 * * * *', async () => {
    const hour = new Date().getHours();
    
    // Custom alerts are checked daily at 9:00 AM
    if (hour === 9) {
      await checkCustomAlerts();
    }
    
    // One-hour-before alerts are checked daily at 11:00 PM (23:00)
    if (hour === 23) {
      await checkOneHourAlerts();
    }
  });
  console.log('Alert Engine: Background hourly cron job scheduled (runs every hour at minute 0).');
};

module.exports = {
  checkCustomAlerts,
  checkOneHourAlerts,
  checkRenewals,
  startAlertEngine
};
