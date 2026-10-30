import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.warn('⚠️ Warning: DATABASE_URL is not set in environment variables.');
}

const isCloudOrSsl = connectionString?.includes('sslmode=require') || 
  connectionString?.includes('neon.tech') || 
  connectionString?.includes('supabase.co');

export const pool = new Pool({
  connectionString,
  ssl: isCloudOrSsl ? { rejectUnauthorized: false } : undefined,
});

export const query = (text: string, params?: unknown[]) => pool.query(text, params);
