-- Esquema de la base de datos de finanzas personales v3.0.0

CREATE TABLE IF NOT EXISTS billeteras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    saldo_inicial REAL DEFAULT 0,
    color TEXT NOT NULL,
    activo BOOLEAN DEFAULT 1
);

CREATE TABLE IF NOT EXISTS propositos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    monto_objetivo REAL NOT NULL,
    monto_actual REAL DEFAULT 0,
    color TEXT NOT NULL,
    estado TEXT DEFAULT 'activo' CHECK(estado IN ('activo', 'completado')),
    is_default BOOLEAN DEFAULT 0
);

CREATE TABLE IF NOT EXISTS evidencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    proposito_id INTEGER NOT NULL,
    image_path TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(proposito_id) REFERENCES propositos(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('ingreso', 'egreso', 'ahorro', 'transferencia', 'retiro_ahorro')),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('indispensable', 'importante', 'no_prioritario')),
    amount REAL NOT NULL CHECK(amount > 0),
    invoice_path TEXT,
    note TEXT,
    billetera_origen_id INTEGER,
    billetera_destino_id INTEGER,
    proposito_id INTEGER,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY(billetera_origen_id) REFERENCES billeteras(id),
    FOREIGN KEY(billetera_destino_id) REFERENCES billeteras(id),
    FOREIGN KEY(proposito_id) REFERENCES propositos(id)
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_priority ON transactions(priority);
CREATE INDEX IF NOT EXISTS idx_evidencias_proposito ON evidencias(proposito_id);
