const fs = require('fs');
let s = fs.readFileSync('./server.js', 'utf8');
s = s.replace('runSql(`INSERT INTO transactions', 'console.log("BODY", req.body); console.log("PARAMS", [type, date, description, priority, amount, invoice_path, note || "", billetera_origen_id || null, billetera_destino_id || null, proposito_id || null]); runSql(`INSERT INTO transactions');
fs.writeFileSync('./server.js', s);
console.log('patched3');
