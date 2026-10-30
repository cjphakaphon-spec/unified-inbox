import fs from 'fs';
import path from 'path';
import { pool } from './index';

async function runMigrations() {
  const client = await pool.connect();
  try {
    console.log('🔄 Connecting to PostgreSQL database...');
    
    // Ensure migrations tracking table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id SERIAL PRIMARY KEY,
        filename TEXT NOT NULL UNIQUE,
        applied_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Fetch applied migrations
    const { rows: appliedRows } = await client.query('SELECT filename FROM schema_migrations');
    const appliedSet = new Set(appliedRows.map((r) => r.filename));

    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let count = 0;
    for (const file of files) {
      if (!appliedSet.has(file)) {
        console.log(`⏳ Applying migration: ${file}...`);
        const filePath = path.join(migrationsDir, file);
        const sql = fs.readFileSync(filePath, 'utf-8');

        await client.query('BEGIN');
        try {
          await client.query(sql);
          await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
          await client.query('COMMIT');
          console.log(`✅ Applied migration: ${file}`);
          count++;
        } catch (err) {
          await client.query('ROLLBACK');
          console.error(`❌ Migration failed for ${file}:`, err);
          throw err;
        }
      } else {
        console.log(`⏩ Already applied: ${file}`);
      }
    }

    console.log(`🎉 Migrations complete. ${count} new migration(s) applied.`);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});
