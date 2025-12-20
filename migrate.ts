import { Database } from './backend/src/config/database';

async function migrate() {
    try {
        const pool = Database.getPool();
        console.log('Running migration...');

        // Add category and position to devices table if they don't exist
        await pool.query(`
            ALTER TABLE devices 
            ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'sonstiges',
            ADD COLUMN IF NOT EXISTS position VARCHAR(50) DEFAULT 'front';
        `);

        console.log('Migration successful.');
    } catch (error) {
        console.error('Migration failed:', error);
    } finally {
        process.exit();
    }
}

migrate();
