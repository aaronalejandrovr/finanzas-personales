const express = require('express');
const initSqlJs = require('sql.js');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// ═══════════════════════════════════════════════════════════════
//  createApp(options)
//  - appDir:  carpeta con archivos de la app (public/, schema.sql)
//  - dataDir: carpeta para datos persistentes (DB, uploads)
//  Devuelve { start(port) } → Promise<{ port, server }>
// ═══════════════════════════════════════════════════════════════

function createApp(options = {}) {
    const appDir  = options.appDir  || __dirname;
    const dataDir = options.dataDir || __dirname;

    // ── Rutas ──────────────────────────────────────────────────
    // Solo lectura (dentro de la app empaquetada)
    const publicDir  = path.join(appDir, 'public');
    const schemaPath = path.join(appDir, 'database', 'schema.sql');

    // Escritura (en carpeta del usuario)
    const uploadsDir = path.join(dataDir, 'uploads');
    const dbDir      = path.join(dataDir, 'database');
    const dbPath     = path.join(dbDir, 'finanzas.db');

    // Crear directorios de datos si no existen
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    if (!fs.existsSync(dbDir))      fs.mkdirSync(dbDir, { recursive: true });

    // ── Base de datos ──────────────────────────────────────────
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
        saveDatabase();
    }

    function saveDatabase() {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }

    // ── Express App ────────────────────────────────────────────
    const app = express();

    app.use(cors());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(express.static(publicDir));
    app.use('/uploads', express.static(uploadsDir));

    // ── Multer ─────────────────────────────────────────────────
    const storage = multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => {
            const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
            const ext = path.extname(file.originalname);
            cb(null, `factura-${uniqueSuffix}${ext}`);
        }
    });

    const fileFilter = (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de archivo no permitido. Solo se aceptan imágenes (JPEG, PNG, GIF, WebP) y PDF.'), false);
        }
    };

    const upload = multer({
        storage,
        fileFilter,
        limits: { fileSize: 10 * 1024 * 1024 }
    });

    // ── Helpers DB ─────────────────────────────────────────────
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

    // ── Rutas API ──────────────────────────────────────────────

    // GET /api/transactions
    app.get('/api/transactions', (req, res) => {
        try {
            let query = 'SELECT * FROM transactions WHERE 1=1';
            const params = [];

            if (req.query.type) {
                query += ' AND type = ?';
                params.push(req.query.type);
            }
            if (req.query.priority) {
                query += ' AND priority = ?';
                params.push(req.query.priority);
            }
            if (req.query.dateFrom) {
                query += ' AND date >= ?';
                params.push(req.query.dateFrom);
            }
            if (req.query.dateTo) {
                query += ' AND date <= ?';
                params.push(req.query.dateTo);
            }

            const sortBy = req.query.sortBy || 'date';
            const sortOrder = req.query.sortOrder || 'DESC';
            const validSortFields = ['date', 'amount'];
            const validSortOrders = ['ASC', 'DESC'];

            if (validSortFields.includes(sortBy) && validSortOrders.includes(sortOrder.toUpperCase())) {
                query += ` ORDER BY ${sortBy} ${sortOrder.toUpperCase()}`;
            } else {
                query += ' ORDER BY date DESC';
            }

            const transactions = queryAll(query, params);
            res.json({ success: true, data: transactions });
        } catch (error) {
            console.error('Error al obtener transacciones:', error);
            res.status(500).json({ success: false, error: 'Error al obtener transacciones' });
        }
    });

    // GET /api/transactions/:id
    app.get('/api/transactions/:id', (req, res) => {
        try {
            const transaction = queryOne('SELECT * FROM transactions WHERE id = ?', [Number(req.params.id)]);
            if (!transaction) {
                return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
            }
            res.json({ success: true, data: transaction });
        } catch (error) {
            console.error('Error al obtener transacción:', error);
            res.status(500).json({ success: false, error: 'Error al obtener transacción' });
        }
    });

    // GET /api/summary — Resumen financiero del mes actual
    app.get('/api/summary', (req, res) => {
        try {
            const currentMonth = new Date().toISOString().slice(0, 7);

            const ingresos = queryOne(
                "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'ingreso' AND strftime('%Y-%m', date) = ?",
                [currentMonth]
            );
            const egresos = queryOne(
                "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'egreso' AND strftime('%Y-%m', date) = ?",
                [currentMonth]
            );
            const ahorros = queryOne(
                "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'ahorro' AND strftime('%Y-%m', date) = ?",
                [currentMonth]
            );

            res.json({
                success: true,
                data: {
                    ingresos: ingresos.total,
                    egresos: egresos.total,
                    ahorros: ahorros.total,
                    balance: ingresos.total - egresos.total - ahorros.total,
                    month: currentMonth
                }
            });
        } catch (error) {
            console.error('Error al obtener resumen:', error);
            res.status(500).json({ success: false, error: 'Error al obtener resumen' });
        }
    });

    // GET /api/monthly-summary
    app.get('/api/monthly-summary', (req, res) => {
        try {
            const rows = queryAll(`
                SELECT
                    strftime('%Y-%m', date) AS month,
                    SUM(CASE WHEN type = 'ingreso' THEN amount ELSE 0 END) AS ingresos,
                    SUM(CASE WHEN type = 'egreso'  THEN amount ELSE 0 END) AS egresos,
                    SUM(CASE WHEN type = 'ahorro'  THEN amount ELSE 0 END) AS ahorros,
                    COUNT(*) AS total_transactions
                FROM transactions
                GROUP BY month
                ORDER BY month DESC
            `);

            const data = rows.map(row => ({
                ...row,
                balance: row.ingresos - row.egresos - row.ahorros
            }));

            res.json({ success: true, data });
        } catch (error) {
            console.error('Error al obtener resumen mensual:', error);
            res.status(500).json({ success: false, error: 'Error al obtener resumen mensual' });
        }
    });

    // POST /api/transactions
    app.post('/api/transactions', upload.single('invoice'), (req, res) => {
        try {
            const { type, date, description, priority, amount, note } = req.body;

            if (!type || !date || !description || !priority || !amount) {
                return res.status(400).json({
                    success: false,
                    error: 'Faltan campos obligatorios: type, date, description, priority, amount'
                });
            }

            const validTypes = ['ingreso', 'egreso', 'ahorro'];
            const validPriorities = ['indispensable', 'importante', 'no_prioritario'];

            if (!validTypes.includes(type)) {
                return res.status(400).json({ success: false, error: 'Tipo inválido' });
            }
            if (!validPriorities.includes(priority)) {
                return res.status(400).json({ success: false, error: 'Prioridad inválida' });
            }

            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ success: false, error: 'Monto inválido' });
            }

            const invoicePath = req.file ? `/uploads/${req.file.filename}` : null;

            const result = runSql(
                `INSERT INTO transactions (type, date, description, priority, amount, invoice_path, note)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [type, date, description, priority, parsedAmount, invoicePath, note || null]
            );

            const transaction = queryOne('SELECT * FROM transactions WHERE id = ?', [result.lastId]);
            res.status(201).json({ success: true, data: transaction });
        } catch (error) {
            console.error('Error al crear transacción:', error);
            res.status(500).json({ success: false, error: 'Error al crear transacción' });
        }
    });

    // DELETE /api/transactions/:id
    app.delete('/api/transactions/:id', (req, res) => {
        try {
            const transaction = queryOne('SELECT * FROM transactions WHERE id = ?', [Number(req.params.id)]);
            if (!transaction) {
                return res.status(404).json({ success: false, error: 'Transacción no encontrada' });
            }

            if (transaction.invoice_path) {
                // Las facturas están en dataDir (uploads/)
                const filePath = path.join(dataDir, transaction.invoice_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }

            runSql('DELETE FROM transactions WHERE id = ?', [Number(req.params.id)]);
            res.json({ success: true, message: 'Transacción eliminada' });
        } catch (error) {
            console.error('Error al eliminar transacción:', error);
            res.status(500).json({ success: false, error: 'Error al eliminar transacción' });
        }
    });

    // Manejo de errores de Multer
    app.use((err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ success: false, error: 'El archivo es demasiado grande. Máximo 10 MB.' });
            }
            return res.status(400).json({ success: false, error: err.message });
        }
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        next();
    });

    // ── start(port) → Promise<{ port, server }> ───────────────
    async function start(port = 3000) {
        await initDatabase();

        return new Promise((resolve, reject) => {
            const server = app.listen(port, () => {
                const actualPort = server.address().port;
                resolve({ port: actualPort, server });
            });
            server.on('error', reject);
        });
    }

    // Exponer para cierre limpio
    function cleanup() {
        if (db) { saveDatabase(); db.close(); }
    }

    return { start, cleanup };
}

// ═══════════════════════════════════════════════════════════════
//  Modo standalone: node server.js
// ═══════════════════════════════════════════════════════════════
if (require.main === module) {
    const instance = createApp();

    instance.start(3000).then(({ port }) => {
        console.log('');
        console.log('  ╔══════════════════════════════════════════════╗');
        console.log('  ║                                              ║');
        console.log('  ║   💰  Finanzas Personales - Servidor activo  ║');
        console.log('  ║                                              ║');
        console.log(`  ║   🌐  http://localhost:${port}                  ║`);
        console.log('  ║                                              ║');
        console.log('  ╚══════════════════════════════════════════════╝');
        console.log('');
    }).catch((err) => {
        console.error('Error fatal al iniciar:', err);
        process.exit(1);
    });

    process.on('SIGINT',  () => { instance.cleanup(); process.exit(0); });
    process.on('SIGTERM', () => { instance.cleanup(); process.exit(0); });
}

module.exports = { createApp };
