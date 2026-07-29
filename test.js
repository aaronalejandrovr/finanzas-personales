const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync('./database/finanzas.db'));
    
    const res = db.exec(`
        SELECT id, type, amount, billetera_origen_id, billetera_destino_id 
        FROM transactions 
        ORDER BY id DESC LIMIT 10
    `);
    console.log(JSON.stringify(res, null, 2));
    
    const b = db.exec(`
        SELECT b.id, b.nombre, 
        (b.saldo_inicial + 
         COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0) - 
         COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0)
        ) as saldo_actual
        FROM billeteras b
    `);
    console.log(JSON.stringify(b, null, 2));
}
test();
