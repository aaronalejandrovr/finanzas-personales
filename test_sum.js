const initSqlJs = require('sql.js');
async function run() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE t (amount REAL); INSERT INTO t VALUES ("100");');
  console.log(db.exec('SELECT SUM(amount) FROM t')[0].values);
}
run();
