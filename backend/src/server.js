import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initDb } from './db/database.js';
import { seedDatabase } from './db/seed.js';
import { initCronJobs } from './services/cronService.js';
import { verifySMTPConnection } from './utils/mailer.js';

import authRoutes from './routes/authRoutes.js';
import memberRoutes from './routes/memberRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import rentalRoutes from './routes/rentalRoutes.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes (Support both /api/* and /* for full compatibility with Vercel rewrites)
app.use(['/api/auth', '/auth'], authRoutes);
app.use(['/api/members', '/members'], memberRoutes);
app.use(['/api/items', '/items'], itemRoutes);
app.use(['/api/rentals', '/rentals'], rentalRoutes);

// Root route & Health check
app.get(['/', '/health', '/api/health'], (req, res) => {
  res.json({
    status: 'ok',
    service: 'IEEE MACE SB Inventory API',
    timestamp: new Date().toISOString(),
    env: process.env.VERCEL ? 'vercel-serverless' : (process.env.NODE_ENV || 'development')
  });
});

// 404 Fallback handler for unmatched API routes
app.use((req, res) => {
  res.status(404).json({ error: 'API route not found', path: req.url });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

export { app };
export default app;

// Initialize DB, Seed, Cron, and Start Server
export async function startServer() {
  try {
    await initDb();
    await seedDatabase();

    // Verify SMTP credentials at startup
    await verifySMTPConnection().catch(err => console.warn('SMTP verification warning:', err.message));

    initCronJobs();

    if (!process.env.VERCEL) {
      app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 IEEE MACE SB Inventory Server running on port ${PORT}`);
        console.log(`📍 API Health: http://localhost:${PORT}/api/health`);
        console.log(`====================================================`);
      });
    }
  } catch (error) {
    console.error('Failed to start server:', error);
    if (!process.env.VERCEL) process.exit(1);
  }
}

if (!process.env.VERCEL && process.argv[1] === __filename) {
  startServer();
}

