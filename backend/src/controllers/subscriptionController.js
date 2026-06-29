const { dbAll, dbGet, dbRun } = require('../config/db');

// Get all subscriptions for authenticated user
exports.getSubscriptions = async (req, res) => {
  const userId = req.user.id;

  try {
    const subscriptions = await dbAll(
      'SELECT * FROM subscriptions WHERE user_id = ? ORDER BY next_renewal_date ASC',
      [userId]
    );
    res.status(200).json(subscriptions);
  } catch (error) {
    console.error('Error fetching subscriptions:', error);
    res.status(500).json({ message: 'Internal server error fetching subscriptions' });
  }
};

// Create a new subscription
exports.createSubscription = async (req, res) => {
  const userId = req.user.id;
  const { service_name, cost, billing_cycle, next_renewal_date, category, alert_days_before } = req.body;

  // Validation
  if (!service_name || cost === undefined || !billing_cycle || !next_renewal_date || !category) {
    return res.status(400).json({ message: 'All subscription fields are required' });
  }

  if (isNaN(cost) || Number(cost) <= 0) {
    return res.status(400).json({ message: 'Cost must be a positive number' });
  }

  if (!['monthly', 'yearly'].includes(billing_cycle)) {
    return res.status(400).json({ message: 'Billing cycle must be either monthly or yearly' });
  }

  if (!['Entertainment', 'Software', 'Utilities', 'Other'].includes(category)) {
    return res.status(400).json({ message: 'Category must be Entertainment, Software, Utilities, or Other' });
  }

  // Basic date validation (YYYY-MM-DD)
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(next_renewal_date)) {
    return res.status(400).json({ message: 'Next renewal date must be in YYYY-MM-DD format' });
  }

  const daysBefore = alert_days_before !== undefined ? parseInt(alert_days_before, 10) : 3;
  if (isNaN(daysBefore) || daysBefore < 0) {
    return res.status(400).json({ message: 'Alert days before must be a non-negative integer' });
  }

  try {
    const result = await dbRun(
      `INSERT INTO subscriptions (user_id, service_name, cost, billing_cycle, next_renewal_date, category, alert_days_before)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, service_name, Number(cost), billing_cycle, next_renewal_date, category, daysBefore]
    );

    const newSub = await dbGet('SELECT * FROM subscriptions WHERE id = ?', [result.id]);
    res.status(201).json(newSub);
  } catch (error) {
    console.error('Error creating subscription:', error);
    res.status(500).json({ message: 'Internal server error creating subscription' });
  }
};

// Update a subscription
exports.updateSubscription = async (req, res) => {
  const userId = req.user.id;
  const subId = req.params.id;
  const { service_name, cost, billing_cycle, next_renewal_date, category, alert_days_before } = req.body;

  // Validation
  if (!service_name || cost === undefined || !billing_cycle || !next_renewal_date || !category) {
    return res.status(400).json({ message: 'All subscription fields are required' });
  }

  if (isNaN(cost) || Number(cost) <= 0) {
    return res.status(400).json({ message: 'Cost must be a positive number' });
  }

  if (!['monthly', 'yearly'].includes(billing_cycle)) {
    return res.status(400).json({ message: 'Billing cycle must be either monthly or yearly' });
  }

  if (!['Entertainment', 'Software', 'Utilities', 'Other'].includes(category)) {
    return res.status(400).json({ message: 'Category must be Entertainment, Software, Utilities, or Other' });
  }

  const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
  if (!dateRegex.test(next_renewal_date)) {
    return res.status(400).json({ message: 'Next renewal date must be in YYYY-MM-DD format' });
  }

  const daysBefore = alert_days_before !== undefined ? parseInt(alert_days_before, 10) : 3;
  if (isNaN(daysBefore) || daysBefore < 0) {
    return res.status(400).json({ message: 'Alert days before must be a non-negative integer' });
  }

  try {
    // Check if subscription exists and belongs to the user
    const existing = await dbGet('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [subId, userId]);
    if (!existing) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    await dbRun(
      `UPDATE subscriptions
       SET service_name = ?, cost = ?, billing_cycle = ?, next_renewal_date = ?, category = ?, alert_days_before = ?
       WHERE id = ? AND user_id = ?`,
      [service_name, Number(cost), billing_cycle, next_renewal_date, category, daysBefore, subId, userId]
    );

    const updatedSub = await dbGet('SELECT * FROM subscriptions WHERE id = ?', [subId]);
    res.status(200).json(updatedSub);
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ message: 'Internal server error updating subscription' });
  }
};

// Delete a subscription
exports.deleteSubscription = async (req, res) => {
  const userId = req.user.id;
  const subId = req.params.id;

  try {
    // Check if subscription exists and belongs to the user
    const existing = await dbGet('SELECT * FROM subscriptions WHERE id = ? AND user_id = ?', [subId, userId]);
    if (!existing) {
      return res.status(404).json({ message: 'Subscription not found' });
    }

    await dbRun('DELETE FROM subscriptions WHERE id = ? AND user_id = ?', [subId, userId]);
    res.status(200).json({ message: 'Subscription deleted successfully', id: Number(subId) });
  } catch (error) {
    console.error('Error deleting subscription:', error);
    res.status(500).json({ message: 'Internal server error deleting subscription' });
  }
};

// Sync subscriptions automatically based on consent and method
exports.syncSubscriptions = async (req, res) => {
  const userId = req.user.id;
  const { method, consent } = req.body;
  const userEmail = req.user.email || '';

  if (!consent) {
    return res.status(400).json({ message: 'User consent is required to sync subscriptions' });
  }

  if (!['email', 'bank'].includes(method)) {
    return res.status(400).json({ message: 'Invalid sync method. Must be email or bank.' });
  }

  try {
    // Generate dates relative to the current local time
    const getFutureDate = (daysOffset) => {
      const d = new Date();
      d.setDate(d.getDate() + daysOffset);
      return d.toISOString().split('T')[0];
    };

    let detected = [];
    if (method === 'email') {
      detected = [
        { service_name: 'Netflix', cost: 15.49, billing_cycle: 'monthly', next_renewal_date: getFutureDate(15), category: 'Entertainment' },
        { service_name: 'Spotify Premium', cost: 11.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(6), category: 'Entertainment' },
        { service_name: 'ChatGPT Plus', cost: 20.00, billing_cycle: 'monthly', next_renewal_date: getFutureDate(18), category: 'Software' }
      ];

      // Add Google One for gmail users, Microsoft 365 for others
      if (userEmail.toLowerCase().endsWith('@gmail.com')) {
        detected.push({ service_name: 'Google One', cost: 2.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(22), category: 'Software' });
      } else {
        detected.push({ service_name: 'Microsoft 365', cost: 9.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(12), category: 'Software' });
      }
    } else if (method === 'bank') {
      detected = [
        { service_name: 'Disney+', cost: 13.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(4), category: 'Entertainment' },
        { service_name: 'Adobe Creative Cloud', cost: 54.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(10), category: 'Software' },
        { service_name: 'NordVPN', cost: 12.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(25), category: 'Utilities' },
        { service_name: 'Amazon Prime', cost: 14.99, billing_cycle: 'monthly', next_renewal_date: getFutureDate(14), category: 'Entertainment' }
      ];
    }

    const syncedSubscriptions = [];

    for (const sub of detected) {
      // Check if subscription with same name already exists for this user (case-insensitive)
      const existing = await dbGet(
        'SELECT * FROM subscriptions WHERE user_id = ? AND LOWER(service_name) = ?',
        [userId, sub.service_name.toLowerCase()]
      );

      if (!existing) {
        const result = await dbRun(
          `INSERT INTO subscriptions (user_id, service_name, cost, billing_cycle, next_renewal_date, category)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [userId, sub.service_name, sub.cost, sub.billing_cycle, sub.next_renewal_date, sub.category]
        );
        const newSub = await dbGet('SELECT * FROM subscriptions WHERE id = ?', [result.id]);
        syncedSubscriptions.push(newSub);
      }
    }

    res.status(200).json({
      message: `Sync successful. Added ${syncedSubscriptions.length} subscription(s).`,
      subscriptions: syncedSubscriptions,
      count: syncedSubscriptions.length
    });
  } catch (error) {
    console.error('Error syncing subscriptions:', error);
    res.status(500).json({ message: 'Internal server error syncing subscriptions' });
  }
};

