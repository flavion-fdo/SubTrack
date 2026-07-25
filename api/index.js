const { initDatabase } = require('../backend/src/config/db');

// Cache the Express app and initialization state across warm invocations
let initialized = false;
let app;

module.exports = async (req, res) => {
  try {
    if (!initialized) {
      await initDatabase();
      app = require('../backend/src/server');
      initialized = true;
    }
    return app(req, res);
  } catch (error) {
    console.error('Vercel Serverless Function Error:', error);
    return res.status(500).json({
      message: error.message || 'Internal Server Error',
      ok: false
    });
  }
};
