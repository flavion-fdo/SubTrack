# SubTrack - Smart Subscription Ledger

SubTrack is a subscription ledger web application that helps users keep track of their ongoing services, billing cycles, monthly/yearly budgets, and alerts them automatically when a subscription is going to renew.

## Key Features

- **Auth System**: Local email registration/login, coupled with social sign-in support (Google, Apple).
- **Interactive Subscription Ledger**: Register, edit, and delete subscription services.
- **Dynamic Analytics**: Real-time spending breakdown and category shares driven by Chart.js.
- **Consent-based Auto-Syncing**: Simulated scanning of connected email accounts or bank accounts to auto-detect and populate active subscriptions.
- **Customizable Renewal Notifications**: Configure specific alert offsets (e.g. Same Day, 1 day, 3 days, 7 days before) per subscription to receive warning emails.
- **Final 1-Hour Alerts**: Fixed automatic email reminders triggered exactly 1 hour before a subscription's renewal is due (11:00 PM on the day before renewal).

---

## Technology Stack

- **Frontend**: React, Vite, Chart.js, vanilla CSS.
- **Backend**: Node.js, Express, SQLite3.
- **Scheduled Background Alerts**: `node-cron`, `nodemailer`.

---

## Directory Structure

```
├── backend/            # Express REST API & Alert Engine
│   ├── src/
│   │   ├── config/     # SQLite DB connections and migrations
│   │   ├── controllers/# Auth, analytics, and subscription handlers
│   │   ├── middleware/ # Token-based auth guard
│   │   └── services/   # Alert engine, email transporter, seeder catalogs
│   └── .env.example
├── frontend/           # React + Vite application
│   ├── src/
│   │   ├── components/ # Dashboard, Auth modules, Onboarding cards
│   │   ├── context/    # Global auth providers
│   │   └── index.css   # Glassmorphic responsive dark mode styling
│   └── .env.example
└── .gitignore          # Root-level git ignore rules
```

---

## Getting Started

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** (comes with Node)

### 2. Backend Setup
1. Open a terminal and navigate to the backend folder:
   ```bash
   cd backend
   ```
2. Copy the example environment template into a new `.env` file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the backend development server (will run on `http://localhost:5000`):
   ```bash
   npm run dev
   ```

### 3. Frontend Setup
1. Open a new terminal and navigate to the frontend folder:
   ```bash
   cd frontend
   ```
2. Copy the example environment template into a new `.env` file:
   ```bash
   cp .env.example .env
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Start the frontend Vite development server (will run on `http://localhost:5173`):
   ```bash
   npm run dev
   ```

---

## Running Verification Tests

To verify that the database table schema, alert calculations, and notification emails compile and run successfully, execute the verification test script:

```bash
cd backend
node src/scripts/test-alert-engine.js
```
This script runs a test suite mocking active subscriptions and logs notification alerts output directly to the local `alerts.log` file in the workspace root.
