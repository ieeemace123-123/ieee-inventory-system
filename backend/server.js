import app from './src/server.js';
import { initDb } from './src/db/database.js';

let isDbInitialized = false;

export default async function handler(req, res) {
  if (!isDbInitialized) {
    try {
      await initDb();
      isDbInitialized = true;
    } catch (err) {
      console.error('[API Handler] Database initialization error:', err.message);
      return res.status(500).json({
        error: 'Database connection failed',
        message: err.message,
        hint: 'Ensure DATABASE_URL environment variable is properly set.'
      });
    }
  }
  return app(req, res);
}
