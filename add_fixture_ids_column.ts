import Database from './backend/src/Database';

async function addFixtureIdsColumn() {
    const pool = Database.getPool();

    try {
        await pool.execute(`
            ALTER TABLE global_palettes 
            ADD COLUMN fixture_ids TEXT DEFAULT NULL
        `);
        console.log('✅ Added fixture_ids column to global_palettes');
    } catch (e: any) {
        if (e.message.includes('Duplicate column')) {
            console.log('ℹ️  Column fixture_ids already exists');
        } else {
            console.error('❌ Failed to add column:', e.message);
        }
    }

    process.exit(0);
}

addFixtureIdsColumn();
