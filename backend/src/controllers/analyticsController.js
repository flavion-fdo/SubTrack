const { dbAll } = require('../config/db');

exports.getAnalytics = async (req, res) => {
  const userId = req.user.id;

  try {
    const subscriptions = await dbAll(
      'SELECT * FROM subscriptions WHERE user_id = ?',
      [userId]
    );

    let totalMonthlySpend = 0;
    let totalYearlySpend = 0;

    const categoryBreakdown = {
      Entertainment: 0,
      Software: 0,
      Utilities: 0,
      Other: 0
    };

    subscriptions.forEach(sub => {
      const cost = Number(sub.cost);
      if (sub.billing_cycle === 'monthly') {
        totalMonthlySpend += cost;
        totalYearlySpend += cost * 12;
        categoryBreakdown[sub.category] += cost; // Normalizing to monthly for category chart
      } else if (sub.billing_cycle === 'yearly') {
        totalMonthlySpend += cost / 12;
        totalYearlySpend += cost;
        categoryBreakdown[sub.category] += cost / 12; // Normalizing to monthly
      }
    });

    // Formatting outputs to 2 decimal places
    const response = {
      totalMonthlySpend: Number(totalMonthlySpend.toFixed(2)),
      totalYearlySpend: Number(totalYearlySpend.toFixed(2)),
      categoryBreakdown: Object.keys(categoryBreakdown).map(cat => ({
        category: cat,
        monthlySpend: Number(categoryBreakdown[cat].toFixed(2))
      })),
      totalCount: subscriptions.length
    };

    res.status(200).json(response);
  } catch (error) {
    console.error('Error generating analytics:', error);
    res.status(500).json({ message: 'Internal server error generating analytics' });
  }
};
