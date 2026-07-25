const { initDatabase } = require('../backend/src/config/db');

// Cache the Express app and initialization state across warm invocations
let initialized = false;
let app;

module.exports = async (req, res) => {
  if (!initialized) {
    await initDatabase();
    app = require('../backend/src/server');
    initialized = true;
  }
  return app(req, res);
};
