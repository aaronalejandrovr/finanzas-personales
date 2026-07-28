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
        
        // Ejecutar schema base
        db.run(schema);

        // Migración de columnas adicionales por versiones anteriores
        const checkColumn = (table, col, alterQuery) => {
            const cols = queryAll(`PRAGMA table_info(${table})`).map(c => c.name);
            if (!cols.includes(col)) {
                try { db.run(alterQuery); } catch(e) { console.error(`Error migrando ${col}:`, e); }
            }
        };

        checkColumn('transactions', 'billetera_origen_id', "ALTER TABLE transactions ADD COLUMN billetera_origen_id INTEGER REFERENCES billeteras(id)");
        checkColumn('transactions', 'billetera_destino_id', "ALTER TABLE transactions ADD COLUMN billetera_destino_id INTEGER REFERENCES billeteras(id)");
        checkColumn('transactions', 'proposito_id', "ALTER TABLE transactions ADD COLUMN proposito_id INTEGER REFERENCES propositos(id)");
        checkColumn('propositos', 'is_default', "ALTER TABLE propositos ADD COLUMN is_default BOOLEAN DEFAULT 0");
        checkColumn('billeteras', 'activo', "ALTER TABLE billeteras ADD COLUMN activo BOOLEAN DEFAULT 1");
        checkColumn('propositos', 'estado', "ALTER TABLE propositos ADD COLUMN estado TEXT DEFAULT 'activo'");

        // Fix de transacciones antiguas
        db.run("UPDATE transactions SET proposito_id = 1 WHERE type = 'ahorro' AND proposito_id IS NULL");

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
            const stmt = db.prepare("INSERT INTO billeteras (nombre, color, activo) VALUES (?, ?, 1)");
            defaultWallets.forEach(w => stmt.run([w.nombre, w.color]));
            stmt.free();
        }

        // Inyectar propósito general por defecto
        const propositosCount = queryOne("SELECT COUNT(*) as c FROM propositos").c;
        if (propositosCount === 0) {
            db.run("INSERT INTO propositos (nombre, monto_objetivo, color, is_default) VALUES ('Liquidez Sin Asignar', 9999999, '#8B5CF6', 1)");
        } else {
            // Asegurar que el Ahorro General esté marcado como default y renombrado
            db.run("UPDATE propositos SET is_default = 1, nombre = 'Liquidez Sin Asignar' WHERE id = 1");
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
            cb(null, `archivo-${uniqueSuffix}${ext}`);
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
            const billeteras = queryAll(`
                SELECT b.*, 
                (b.saldo_inicial + 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0) - 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0)
                ) as saldo_actual
                FROM billeteras b
                WHERE b.activo = 1 OR b.activo IS NULL
            `);
            res.json({ success: true, data: billeteras });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/billeteras', (req, res) => {
        try {
            const { nombre, saldo_inicial, color } = req.body;
            runSql("INSERT INTO billeteras (nombre, saldo_inicial, color, activo) VALUES (?, ?, ?, 1)", 
                   [nombre, saldo_inicial || 0, color || '#6B7280']);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.put('/api/billeteras/:id', (req, res) => {
        try {
            const { nombre } = req.body;
            runSql("UPDATE billeteras SET nombre = ? WHERE id = ?", [nombre, req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.put('/api/billeteras/:id/ocultar', (req, res) => {
        try {
            runSql("UPDATE billeteras SET activo = 0 WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/billeteras/:id/desglose', (req, res) => {
        try {
            const id = req.params.id;
            
            // 1. Balance total real de la billetera
            const billetera = queryOne(`
                SELECT b.*, 
                (b.saldo_inicial + 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_destino_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0) - 
                 COALESCE((SELECT SUM(amount) FROM transactions WHERE billetera_origen_id = b.id AND type NOT IN ('ahorro', 'retiro_ahorro')), 0)
                ) as saldo_actual
                FROM billeteras b
                WHERE b.id = ?
            `, [id]);

            if (!billetera) return res.status(404).json({ success: false, error: "Billetera no encontrada" });

            // 2. Desglose de aportes a metas específicos procedentes de esta billetera
            const desglose = queryAll(`
                SELECT p.id, p.nombre, p.color,
                (
                    COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND billetera_origen_id = ? AND type = 'ahorro'), 0) -
                    COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND billetera_destino_id = ? AND type = 'retiro_ahorro'), 0)
                ) as asignado
                FROM propositos p
                WHERE p.id != 1
                HAVING asignado > 0
            `, [id, id]);

            const totalAsignado = desglose.reduce((sum, item) => sum + item.asignado, 0);
            
            // 3. Lo restante es Liquidez Sin Asignar
            const sinAsignar = Math.max(0, billetera.saldo_actual - totalAsignado);
            
            res.json({ 
                success: true, 
                data: {
                    saldo_actual: billetera.saldo_actual,
                    sin_asignar: sinAsignar,
                    metas: desglose
                } 
            });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Endpoints Metas de Ahorro ─────────────────────────────
    app.get('/api/propositos', (req, res) => {
        try {
            const propositos = queryAll(`
                SELECT p.*,
                COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND type = 'ahorro'), 0) -
                COALESCE((SELECT SUM(amount) FROM transactions WHERE proposito_id = p.id AND type = 'retiro_ahorro'), 0)
                as monto_actual_calculado
                FROM propositos p
            `);
            const data = propositos.map(p => ({ ...p, monto_actual: p.monto_actual_calculado }));
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

    app.put('/api/propositos/:id', (req, res) => {
        try {
            const { nombre, monto_objetivo } = req.body;
            runSql("UPDATE propositos SET nombre = ?, monto_objetivo = ? WHERE id = ?", 
                   [nombre, monto_objetivo, req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/propositos/:id', (req, res) => {
        try {
            const id = req.params.id;
            const meta = queryOne("SELECT is_default FROM propositos WHERE id = ?", [id]);
            if (meta && meta.is_default) {
                return res.status(400).json({ success: false, error: "No se puede eliminar la meta genérica." });
            }
            runSql("UPDATE transactions SET proposito_id = 1 WHERE proposito_id = ?", [id]);
            runSql("DELETE FROM evidencias WHERE proposito_id = ?", [id]);
            runSql("DELETE FROM propositos WHERE id = ?", [id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.put('/api/propositos/:id/completar', (req, res) => {
        try {
            runSql("UPDATE propositos SET estado = 'completado' WHERE id = ?", [req.params.id]);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Evidencias de Ahorros ─────────────────────────────────
    app.get('/api/propositos/:id/evidencias', (req, res) => {
        try {
            const evidencias = queryAll("SELECT * FROM evidencias WHERE proposito_id = ? ORDER BY created_at DESC", [req.params.id]);
            res.json({ success: true, data: evidencias });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.post('/api/propositos/:id/evidencias', upload.array('evidencias', 5), (req, res) => {
        try {
            if (req.files && req.files.length > 0) {
                req.files.forEach(file => {
                    const pathUrl = `/uploads/${file.filename}`;
                    runSql("INSERT INTO evidencias (proposito_id, image_path) VALUES (?, ?)", [req.params.id, pathUrl]);
                });
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    // ── Endpoints Transacciones ────────────────────────────────
    app.get('/api/transactions', (req, res) => {
        try {
            const { month, type } = req.query;
            let query = `
                SELECT t.*, 
                       bo.nombre as billetera_origen_nombre,
                       bd.nombre as billetera_destino_nombre,
                       p.nombre as proposito_nombre
                FROM transactions t
                LEFT JOIN billeteras bo ON t.billetera_origen_id = bo.id
                LEFT JOIN billeteras bd ON t.billetera_destino_id = bd.id
                LEFT JOIN propositos p ON t.proposito_id = p.id
                WHERE 1=1
            `;
            const params = [];
            
            if (month) {
                query += ` AND strftime('%Y-%m', t.date) = ?`;
                params.push(month);
            }
            if (type) {
                query += ` AND t.type = ?`;
                params.push(type);
            }
            
            query += ` ORDER BY t.date DESC`;
            
            const transactions = queryAll(query, params);
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
                    [type, date, description, priority, amount, invoice_path, note || '', billetera_origen_id || null, billetera_destino_id || null, proposito_id || null]);
            
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.put('/api/transactions/:id', upload.single('invoice'), (req, res) => {
        try {
            const { date, description, priority, amount, note, delete_invoice } = req.body;
            const id = req.params.id;
            
            let query = "UPDATE transactions SET date = ?, description = ?, priority = ?, amount = ?, note = ?";
            let params = [date, description, priority, amount, note || ''];

            if (req.file) {
                query += ", invoice_path = ?";
                params.push(`/uploads/${req.file.filename}`);
            } else if (delete_invoice === 'true') {
                query += ", invoice_path = NULL";
            }

            query += " WHERE id = ?";
            params.push(id);

            runSql(query, params);
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.delete('/api/transactions/:id/invoice', (req, res) => {
        try {
            const id = req.params.id;
            const tx = queryOne("SELECT invoice_path FROM transactions WHERE id = ?", [id]);
            if (tx && tx.invoice_path) {
                const filePath = path.join(dataDir, tx.invoice_path);
                if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                runSql("UPDATE transactions SET invoice_path = NULL WHERE id = ?", [id]);
            }
            res.json({ success: true });
        } catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    });

    app.get('/api/summary', (req, res) => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);
            
            const ingresos = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'ingreso' AND strftime('%Y-%m', date) = ?", [currentMonth]).t;
            const egresos = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'egreso' AND strftime('%Y-%m', date) = ?", [currentMonth]).t;
            
            const aportes = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'ahorro'").t;
            const retiros = queryOne("SELECT COALESCE(SUM(amount), 0) as t FROM transactions WHERE type = 'retiro_ahorro'").t;
            const ahorros_netos = aportes - retiros;

            const baseBilleteras = queryOne("SELECT COALESCE(SUM(saldo_inicial), 0) as t FROM billeteras WHERE activo = 1 OR activo IS NULL").t;

            res.json({
                success: true,
                data: {
                    ingresos,
                    egresos,
                    ahorros: ahorros_netos,
                    balance: (baseBilleteras + ingresos) - egresos, 
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
