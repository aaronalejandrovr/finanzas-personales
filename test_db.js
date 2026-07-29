const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync('./database/finanzas.db'));
    
    const res = db.exec(`
        SELECT id, type, amount, billetera_origen_id, billetera_destino_id 
        FROM transactions 
        WHERE type = 'egreso'
        ORDER BY id DESC LIMIT 10
    `);
    console.log(JSON.stringify(res, null, 2));
}
test();
