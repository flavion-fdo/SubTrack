const app = require('../backend/src/server');
const { initDatabase } = require('../backend/src/config/db');

// Initialize database tables asynchronously on cold start
initDatabase().catch(err => {
  console.error('Cold-start DB initialization error:', err.message);
});

// Export Express app directly so Vercel natively manages the serverless HTTP lifecycle
module.exports = app;
