import { Router, Request, Response } from 'express';
import { pool } from '../db';
import { comparePassword, generateToken, authenticateAgent, AuthenticatedRequest } from '../services/auth';

const router = Router();

// In-memory rate limiting map for login
const loginAttempts = new Map<string, { count: number; firstAttempt: number }>();
const MAX_ATTEMPTS = 10;
const WINDOW_MS = 60 * 1000; // 1 minute

function rateLimitLogin(req: Request, res: Response, next: () => void): void {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const record = loginAttempts.get(ip);

  if (!record || now - record.firstAttempt > WINDOW_MS) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    next();
    return;
  }

  if (record.count >= MAX_ATTEMPTS) {
    res.status(429).json({ error: 'Too many login attempts. Please try again later.' });
    return;
  }

  record.count++;
  next();
}

/**
 * POST /api/auth/login
 * Staff login with email and password
 */
router.post('/login', rateLimitLogin, async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ error: 'Email and password are required' });
    return;
  }

  try {
    const userRes = await pool.query(
      'SELECT id, name, email, password_hash, role FROM agents WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    if (userRes.rows.length === 0) {
      res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (Invalid credentials)' });
      return;
    }

    const agent = userRes.rows[0];
    const passwordMatch = await comparePassword(password, agent.password_hash);

    if (!passwordMatch) {
      res.status(401).json({ error: 'อีเมลหรือรหัสผ่านไม่ถูกต้อง (Invalid credentials)' });
      return;
    }

    const authenticatedUser = {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      role: agent.role,
    };

    const token = generateToken(authenticatedUser);

    res.json({
      token,
      agent: authenticatedUser,
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * GET /api/auth/me
 * Get current logged in agent profile
 */
router.get('/me', authenticateAgent, (req: AuthenticatedRequest, res: Response): void => {
  res.json({ agent: req.user });
});

export default router;
