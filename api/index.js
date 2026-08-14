import app from '../backend/src/server.js';
import { initDb } from '../backend/src/db/database.js';

let initializationPromise;

export default async function handler(req, res) {
  initializationPromise ||= initDb();
  try {
    await initializationPromise;
    return app(req, res);
  } catch (error) {
    console.error('[Vercel] Database initialization failed:', error.message);
    initializationPromise = undefined;
    return res.status(503).json({ error: 'Service initialization failed.' });
  }
}
