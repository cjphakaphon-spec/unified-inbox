import { describe, it, expect } from 'vitest';
import { pool } from '../src/db';

describe('Database Connection & Schema (Neon)', () => {

  it('connects to Neon and verifies all required tables exist', async () => {
    const res = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = res.rows.map((r: { table_name: string }) => r.table_name);
    
    expect(tableNames).toContain('channels');
    expect(tableNames).toContain('customers');
    expect(tableNames).toContain('identities');
    expect(tableNames).toContain('agents');
    expect(tableNames).toContain('conversations');
    expect(tableNames).toContain('messages');
    expect(tableNames).toContain('schema_migrations');
  });

  it('verifies indexes on conversations and messages', async () => {
    const res = await pool.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE schemaname = 'public';
    `);

    const indexNames = res.rows.map((r: { indexname: string }) => r.indexname);
    expect(indexNames).toContain('idx_conversations_last_message_at');
    expect(indexNames).toContain('idx_messages_conversation_created');
  });
});
