const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { initDatabase } = require('./config/db');
const { startAlertEngine } = require('./services/alertEngine');

// Import routes
const authRoutes = require('./controllers/authController');
const subscriptionRoutes = require('./controllers/subscriptionController');
const analyticsRoutes = require('./controllers/analyticsController');
const authMiddleware = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS
const allowedOrigin = process.env.FRONTEND_URL || 'http://localhost:5173';
app.use(cors({
  origin: allowedOrigin,
  credentials: true
}));

// Parse JSON request bodies
app.use(express.json());

// Routes setup
// Auth routes
app.post('/api/auth/register', authRoutes.register);
app.post('/api/auth/login', authRoutes.login);
app.post('/api/auth/google', authRoutes.googleAuth);
app.post('/api/auth/apple', authRoutes.appleAuth);

// Subscription suggestions (public, but usually called right after auth)
app.get('/api/subscriptions/suggestions', authRoutes.getSubscriptionSuggestions);

// Subscriptions routes (protected)
app.get('/api/subscriptions', authMiddleware, subscriptionRoutes.getSubscriptions);
app.post('/api/subscriptions', authMiddleware, subscriptionRoutes.createSubscription);
app.post('/api/subscriptions/seed', authMiddleware, authRoutes.seedUserSubscriptions);
app.post('/api/subscriptions/sync', authMiddleware, subscriptionRoutes.syncSubscriptions);
app.put('/api/subscriptions/:id', authMiddleware, subscriptionRoutes.updateSubscription);
app.delete('/api/subscriptions/:id', authMiddleware, subscriptionRoutes.deleteSubscription);

// Analytics routes (protected)
app.get('/api/analytics', authMiddleware, analyticsRoutes.getAnalytics);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', time: new Date().toISOString() });
});

// 404 Catch-all handler for unhandled endpoints
app.use((req, res, next) => {
  res.status(404).json({ message: 'Endpoint not found' });
});

// Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err.stack);
  res.status(500).json({ 
    message: 'Internal server error',
    ...(process.env.NODE_ENV !== 'production' && { error: err.message, stack: err.stack })
  });
});

// Initialize database and start server
const startServer = async () => {
  try {
    // 1. Initialise database tables
    await initDatabase();

    // 2. Start the alert engine cron jobs
    startAlertEngine();

    // 3. Start Express server listener
    app.listen(PORT, () => {
      console.log(`SubTrack backend server running on port: ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();
