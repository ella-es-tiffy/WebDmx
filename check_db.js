const mysql = require('mysql2/promise');

async function check() {
    const conn = await mysql.createConnection({
        host: 'localhost',
        port: 3307,
        user: 'dmx_user',
        password: 'dmx_pass',
        database: 'dmx'
    });
    const [tables] = await conn.query('SHOW TABLES');
    console.log('Tables:', tables);

    for (const table of tables) {
        const tableName = Object.values(table)[0];
        const [columns] = await conn.query(`DESCRIBE ${tableName}`);
        console.log(`Columns for ${tableName}:`, columns.map(c => c.Field));
    }

    await conn.end();
}

check().catch(console.error);
