const initSqlJs = require('sql.js');

async function run() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE billeteras (id INTEGER, saldo_inicial REAL);');
  db.run('INSERT INTO billeteras VALUES (1, 1000);');
  db.run('CREATE TABLE transactions (type TEXT, amount REAL, billetera_origen_id INTEGER, billetera_destino_id INTEGER);');
  db.run('INSERT INTO transactions VALUES ("egreso", 100, 1, NULL);');
  db.run('INSERT INTO transactions VALUES ("ingreso", 200, NULL, 1);');
  db.run('INSERT INTO transactions VALUES ("ahorro", 50, 1, NULL);'); // This should NOT reduce the balance
  
  const res = db.exec(`
    SELECT b.id, 
    (b.saldo_inicial + 
     COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0) - 
     COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0)
    ) as saldo_actual 
    FROM billeteras b
  `);
  console.log(JSON.stringify(res, null, 2));
}

run();
