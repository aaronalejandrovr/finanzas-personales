const initSqlJs = require('sql.js');
const fs = require('fs');

async function test() {
    const SQL = await initSqlJs();
    const db = new SQL.Database(fs.readFileSync('./database/finanzas.db'));
    
    // Select all egresos
    const egresos = db.exec(`SELECT * FROM transactions WHERE type = 'egreso'`);
    console.log("EGRESOS:", JSON.stringify(egresos, null, 2));

    const billeteras = db.exec(`
        SELECT b.id, b.nombre,
        (b.saldo_inicial + 
         COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0) - 
         COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0)
        ) as saldo_actual
        FROM billeteras b
    `);
    console.log("BILLETERAS:", JSON.stringify(billeteras, null, 2));
}
test();
