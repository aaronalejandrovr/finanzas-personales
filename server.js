const express = require('express');
const initSqlJs = require('sql.js');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

function createApp(options = {}) {
    const appDir  = options.appDir  || __dirname;
    const dataDir = options.dataDir || __dirname;

    const publicDir  = path.join(appDir, 'public');
    const schemaPath = path.join(appDir, 'database', 'schema.sql');
    const uploadsDir = path.join(dataDir, 'uploads');
    const dbDir      = path.join(dataDir, 'database');
    const dbPath     = path.join(dbDir, 'finanzas.db');

    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(dbDir))      fs.mkdirSync(dbDir, { recursive: true });

    let db;

    async function initDatabase() {
        const SQL = await initSqlJs();

        if (fs.existsSync(dbPath)) {
            const fileBuffer = fs.readFileSync(dbPath);
            db = new SQL.Database(fileBuffer);
        } else {
            db = new SQL.Database();
        }

        const schema = fs.readFileSync(schemaPath, 'utf-8');
        db.run(schema);

        // Migración: Agregar nuevas columnas a transactions si no existen
        const tableInfo = queryAll("PRAGMA table_info(transactions)");
        const columns = tableInfo.map(c => c.name);
        
        if (!columns.includes('billetera_origen_id')) {
            db.run("ALTER TABLE transactions ADD COLUMN billetera_origen_id INTEGER REFERENCES billeteras(id)");
            db.run("ALTER TABLE transactions ADD COLUMN billetera_destino_id INTEGER REFERENCES billeteras(id)");
            db.run("ALTER TABLE transactions ADD COLUMN proposito_id INTEGER REFERENCES propositos(id)");
            
            // Asignar transacciones antiguas tipo "ahorro" al Ahorro General (id 1)
            db.run("UPDATE transactions SET proposito_id = 1 WHERE type = 'ahorro'");
        }

        // Inyectar billeteras por defecto
        const billeterasCount = queryOne("SELECT COUNT(*) as c FROM billeteras").c;
        if (billeterasCount === 0) {
            const defaultWallets = [
                { nombre: 'Efectivo', color: '#10B981' }, 
                { nombre: 'Banco Nacional', color: '#3B82F6' },
                { nombre: 'Binance', color: '#F59E0B' }, 
                { nombre: 'Zinli', color: '#EC4899' }, 
                { nombre: 'PayPal', color: '#003087' } 
            ];
            const stmt = db.prepare("INSERT INTO billeteras (nombre, color) VALUES (?, ?)");
            defaultWallets.forEach(w => stmt.run([w.nombre, w.color]));
            stmt.free();
        }

        // Inyectar propósito general por defecto
        const propositosCount = queryOne("SELECT COUNT(*) as c FROM propositos").c;
        if (propositosCount === 0) {
            db.run("INSERT INTO propositos (nombre, monto_objetivo, color) VALUES ('Ahorro General', 9999999, '#8B5CF6')");
        }

        saveDatabase();
    }

    function saveDatabase() {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }

    const app = express();
    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(publicDir));
    app.use('/uploads', express.static(uploadsDir));

    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `factura-${uniqueSuffix}${ext}`);
        }
    });

    const upload = multer({ storage });

    function queryAll(sql, params = []) {
        const stmt = db.prepare(sql);
        if (params.length > 0) stmt.bind(params);
        const results = [];
        while (stmt.step()) results.push(stmt.getAsObject());
        stmt.free();
        return results;
    }

    function queryOne(sql, params = []) {
        const results = queryAll(sql, params);
        return results.length > 0 ? results[0] : null;
    }

    function runSql(sql, params = []) {
        db.run(sql, params);
        saveDatabase();
        return { lastId: db.exec("SELECT last_insert_rowid()")[0]?.values[0]?.[0] };
    }

    // ── Endpoints Billeteras ──────────────────────────────────
    app.get('/api/billeteras', (req, res) => {
        try {
            // Calcular saldo actual = saldo_inicial + entradas - salidas
            const billeteras = queryAll(`
                SELECT b.*, 
                (b.saldo_inicial + 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id), 0) - 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id), 0)
                ) as saldo_actual
                FROM billeteras b
                WHERE b.activo = 1
            `);
            res.json({ success: true, data: billeteras });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/billeteras', (req, res) => {
        try {
            const { nombre, saldo_inicial, color } = req.body;
            runSql("INSERT INTO billeteras (nombre, saldo_inicial, color) VALUES (?, ?, ?)", 
                   [nombre, saldo_inicial || 0, color || '#6B7280']);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Endpoints Propósitos ──────────────────────────────────
    app.get('/api/propositos', (req, res) => {
        try {
            // Calcular monto_actual = aportes (ahorro) - retiros (retiro_ahorro)
            const propositos = queryAll(`
                SELECT p.*,
                COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND type = 'ahorro'), 0) -
                COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND type = 'retiro_ahorro'), 0)
                as monto_actual_calculado
                FROM propositos p
            `);
            // Mapeamos para usar monto_actual_calculado en lugar de la columna estática
            const data = propositos.map(p => ({
                ...p,
                monto_actual: p.monto_actual_calculado
            }));
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/propositos', (req, res) => {
        try {
            const { nombre, monto_objetivo, color } = req.body;
            runSql("INSERT INTO propositos (nombre, monto_objetivo, color) VALUES (?, ?, ?)", 
                   [nombre, monto_objetivo, color || '#6B7280']);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Endpoints Transacciones ────────────────────────────────
    app.get('/api/transactions', (req, res) => {
        try {
            const query = `
                SELECT t.*, 
                       bo.nombre as billetera_origen_nombre,
                       bd.nombre as billetera_destino_nombre,
                       p.nombre as proposito_nombre
                FROM transactions t
                LEFT JOIN billeteras bo ON t.billetera_origen_id = bo.id
                LEFT JOIN billeteras bd ON t.billetera_destino_id = bd.id
                LEFT JOIN propositos p ON t.proposito_id = p.id
                ORDER BY t.date DESC
            `;
            const transactions = queryAll(query);
            res.json({ success: true, data: transactions });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/transactions', upload.single('invoice'), (req, res) => {
        try {
            const { type, date, description, priority, amount, note, billetera_origen_id, billetera_destino_id, proposito_id } = req.body;
            const invoice_path = req.file ? `/uploads/${req.file.filename}` : null;

            runSql(`INSERT INTO transactions 
                    (type, date, description, priority, amount, invoice_path, note, billetera_origen_id, billetera_destino_id, proposito_id) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, 
                    [type, date, description, priority, amount, invoice_path, note, billetera_origen_id || null, billetera_destino_id || null, proposito_id || null]);
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/transactions/:id', (req, res) => {
        try {
            const id = req.params.id;
            const tx = queryOne("SELECT invoice_path FROM transactions WHERE id = ?", [id]);
            if (tx && tx.invoice_path) {
                const filePath = path.join(dataDir, tx.invoice_path);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
            }
            runSql("DELETE FROM transactions WHERE id = ?", [id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/summary', (req, res) => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            // Ingresos son los tipo 'ingreso' puros
            const ingresos = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'ingreso' AND strftime('%Y-%m', date) = ?", [currentMonth]).t;
            // Egresos son los tipo 'egreso' puros
            const egresos = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'egreso' AND strftime('%Y-%m', date) = ?", [currentMonth]).t;
            
            // Los ahorros netos (históricos globales)
            const aportes = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'ahorro'").t;
            const retiros = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'retiro_ahorro'").t;
            const ahorros_netos = aportes - retiros;

            res.json({
                success: true,
                data: {
                    ingresos,
                    egresos,
                    ahorros: ahorros_netos,
                    balance: ingresos - egresos,
                    month: currentMonth
                }
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/monthly-summary', (req, res) => {
        try {
            const rows = queryAll(`
                SELECT
                    strftime('%Y-%m', date) AS month,
                    SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) AS ingresos,
                    SUM(CASE WHEN type = 'egreso'  THEN amount ELSE 0 END) AS egresos,
                    COUNT(*) AS total_transactions
                FROM transactions
                GROUP BY month
                ORDER BY month DESC
            `);
            const data = rows.map(r => ({ ...r, balance: r.ingresos - r.egresos }));
            res.json({ success: true, data });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    return {
        start: async (port = 0) => {
            await initDatabase();
            return new Promise((resolve) => {
                const server = app.listen(port, () => {
                    resolve({ port: server.address().port, server });
                });
            });
        },
        cleanup: () => {
            if (db) {
                saveDatabase();
                db.close();
            }
        }
    };
}

module.exports = { createApp };
