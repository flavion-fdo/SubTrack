/**
 * Subscription Seeder Service
 * 
 * Provides a curated catalog of popular subscriptions and methods
 * to suggest/seed them for new users based on their auth provider.
 */

const { dbRun } = require('../config/db');

// ─── Curated Subscription Catalog ───────────────────────────────────────────
const SUBSCRIPTION_CATALOG = [
  // Entertainment
  { key: 'netflix',         name: 'Netflix',            cost: 15.49,  cycle: 'monthly', category: 'Entertainment', tags: ['all'] },
  { key: 'spotify',         name: 'Spotify Premium',    cost: 11.99,  cycle: 'monthly', category: 'Entertainment', tags: ['all'] },
  { key: 'youtube_premium', name: 'YouTube Premium',    cost: 13.99,  cycle: 'monthly', category: 'Entertainment', tags: ['google'] },
  { key: 'disney_plus',     name: 'Disney+',            cost: 13.99,  cycle: 'monthly', category: 'Entertainment', tags: ['all'] },
  { key: 'hbo_max',         name: 'Max (HBO)',          cost: 16.99,  cycle: 'monthly', category: 'Entertainment', tags: ['all'] },
  { key: 'apple_tv',        name: 'Apple TV+',          cost: 9.99,   cycle: 'monthly', category: 'Entertainment', tags: ['apple'] },
  { key: 'apple_music',     name: 'Apple Music',        cost: 10.99,  cycle: 'monthly', category: 'Entertainment', tags: ['apple'] },
  { key: 'amazon_prime',    name: 'Amazon Prime',       cost: 14.99,  cycle: 'monthly', category: 'Entertainment', tags: ['all'] },

  // Software / Productivity
  { key: 'google_one',      name: 'Google One',         cost: 2.99,   cycle: 'monthly', category: 'Software',      tags: ['google'] },
  { key: 'icloud_plus',     name: 'iCloud+',            cost: 2.99,   cycle: 'monthly', category: 'Software',      tags: ['apple'] },
  { key: 'microsoft_365',   name: 'Microsoft 365',      cost: 9.99,   cycle: 'monthly', category: 'Software',      tags: ['all'] },
  { key: 'adobe_cc',        name: 'Adobe Creative Cloud', cost: 54.99, cycle: 'monthly', category: 'Software',     tags: ['all'] },
  { key: 'notion',          name: 'Notion Plus',        cost: 10.00,  cycle: 'monthly', category: 'Software',      tags: ['all'] },
  { key: 'chatgpt_plus',    name: 'ChatGPT Plus',       cost: 20.00,  cycle: 'monthly', category: 'Software',      tags: ['all'] },
  { key: 'github_pro',      name: 'GitHub Pro',         cost: 4.00,   cycle: 'monthly', category: 'Software',      tags: ['all'] },

  // Utilities
  { key: 'nordvpn',         name: 'NordVPN',            cost: 12.99,  cycle: 'monthly', category: 'Utilities',     tags: ['all'] },
  { key: 'dropbox',         name: 'Dropbox Plus',       cost: 11.99,  cycle: 'monthly', category: 'Utilities',     tags: ['all'] },
];

/**
 * Get subscription suggestions tailored to the user's auth provider.
 * Google users see Google services prioritized, Apple users see Apple services, etc.
 * @param {string} provider - 'google' | 'apple' | 'local'
 * @returns {Array} Sorted catalog entries with `highlighted` flag
 */
function getSuggestionsForProvider(provider) {
  return SUBSCRIPTION_CATALOG.map(item => {
    const isHighlighted = item.tags.includes(provider);
    return {
      ...item,
      highlighted: isHighlighted,
    };
  }).sort((a, b) => {
    // Highlighted items first, then alphabetical
    if (a.highlighted && !b.highlighted) return -1;
    if (!a.highlighted && b.highlighted) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Bulk-create subscriptions for a user from selected catalog keys.
 * Sets next_renewal_date to 30 days from now for monthly, 365 for yearly.
 * @param {number} userId
 * @param {string[]} selectedKeys - array of catalog `key` values
 * @returns {Promise<number>} Number of subscriptions created
 */
async function seedSubscriptions(userId, selectedKeys) {
  if (!selectedKeys || selectedKeys.length === 0) return 0;

  const now = new Date();
  let created = 0;

  for (const key of selectedKeys) {
    const item = SUBSCRIPTION_CATALOG.find(s => s.key === key);
    if (!item) continue;

    const renewalDate = new Date(now);
    if (item.cycle === 'monthly') {
      renewalDate.setDate(renewalDate.getDate() + 30);
    } else {
      renewalDate.setDate(renewalDate.getDate() + 365);
    }
    const dateStr = renewalDate.toISOString().split('T')[0]; // YYYY-MM-DD

    await dbRun(
      `INSERT INTO subscriptions (user_id, service_name, cost, billing_cycle, next_renewal_date, category)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [userId, item.name, item.cost, item.cycle, dateStr, item.category]
    );
    created++;
  }

  return created;
}

module.exports = {
  SUBSCRIPTION_CATALOG,
  getSuggestionsForProvider,
  seedSubscriptions,
};
