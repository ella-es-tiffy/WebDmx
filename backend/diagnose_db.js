const mysql = require('mysql2/promise');
const dbConfig = {
    host: 'localhost',
    port: 3307,
    user: 'dmx_user',
    password: 'dmx_pass',
    database: 'dmx'
};

async function check() {
    const connection = await mysql.createConnection(dbConfig);
    console.log('--- fader_chasers table structure ---');
    const [columns] = await connection.execute('DESCRIBE fader_chasers');
    columns.forEach(c => console.log(`${c.Field}: ${c.Type}`));

    console.log('\n--- fader_chasers data ---');
    const [rows] = await connection.execute('SELECT * FROM fader_chasers');
    rows.forEach(r => console.log(JSON.stringify(r)));

    await connection.end();
}
check();
