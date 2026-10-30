import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { Request, Response, NextFunction } from 'express';
import { pool } from '../db';

export interface AuthenticatedUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_key_unified_inbox';

export async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(password, salt);
}

export async function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function generateToken(user: AuthenticatedUser): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function authenticateAgent(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return;
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

/**
 * Seed initial agent if no agent exists in DB
 */
export async function seedInitialAgent(): Promise<void> {
  try {
    const check = await pool.query('SELECT id FROM agents LIMIT 1');
    if (check.rows.length === 0) {
      const defaultPassword = 'password123';
      const hash = await hashPassword(defaultPassword);
      await pool.query(
        'INSERT INTO agents (name, email, password_hash, role) VALUES ($1, $2, $3, $4)',
        ['Admin Staff', 'admin@inbox.com', hash, 'admin']
      );
      console.log('🌱 Seeded default agent: admin@inbox.com / password123');
    }
  } catch (err) {
    console.error('Error seeding initial agent:', err);
  }
}
