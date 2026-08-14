import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { getDbClient } from '../db/database.js';
import { authenticateAdmin } from '../middleware/auth.js';

const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const db = getDbClient();
    const admin = await db.get('SELECT * FROM admins WHERE username = $1', [username]);

    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const isMatch = await bcrypt.compare(password, admin.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      console.error('[Auth] JWT_SECRET is not configured.');
      return res.status(503).json({ error: 'Authentication is not configured.' });
    }
    const token = jwt.sign(
      { id: admin.id, username: admin.username },
      secret,
      { expiresIn: '24h' }
    );

    return res.json({
      message: 'Login successful',
      token,
      admin: { id: admin.id, username: admin.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Server error during login.' });
  }
});

// GET /api/auth/me
router.get('/me', authenticateAdmin, async (req, res) => {
  return res.json({ admin: req.admin });
});

export default router;
