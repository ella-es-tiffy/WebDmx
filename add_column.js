const mysql = require('mysql2/promise');

async function addColumn() {
    const connection = await mysql.createConnection({
        host: 'localhost',
        user: 'root',
        password: 'root',
        database: 'neko_dmx'
    });

    try {
        await connection.execute(`
            ALTER TABLE global_palettes 
            ADD COLUMN IF NOT EXISTS fixture_ids TEXT DEFAULT NULL
        `);
        console.log('✅ Column added successfully');
    } catch (error) {
        console.error('❌ Error:', error.message);
    } finally {
        await connection.end();
    }
}

addColumn();
