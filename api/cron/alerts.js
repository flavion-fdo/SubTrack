const { initDatabase } = require('../../backend/src/config/db');
const { checkCustomAlerts, checkOneHourAlerts } = require('../../backend/src/services/alertEngine');

/**
 * Vercel Cron Job endpoint for SubTrack renewal alerts.
 * 
 * Triggered daily by Vercel's cron scheduler (configured in vercel.json).
 * Protected by CRON_SECRET to prevent unauthorized access.
 * Runs both custom-day alerts and one-hour-before alerts.
 */
module.exports = async (req, res) => {
  // Verify the request is from Vercel Cron (security check)
  const authHeader = req.headers['authorization'];
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Ensure database is initialized
    await initDatabase();

    console.log('Cron: Running scheduled renewal alert checks...');

    // Run both alert check types
    await checkCustomAlerts();
    await checkOneHourAlerts(true); // force=true bypasses the hour check

    console.log('Cron: All renewal alert checks completed.');

    return res.status(200).json({
      ok: true,
      message: 'Alert checks completed',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Cron: Alert check failed:', error);
    return res.status(500).json({
      ok: false,
      message: 'Alert check failed',
      error: error.message
    });
  }
};
