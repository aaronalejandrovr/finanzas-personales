-- Esquema de la base de datos de finanzas personales
CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK(type IN ('ingreso', 'egreso', 'ahorro')),
    date TEXT NOT NULL,
    description TEXT NOT NULL,
    priority TEXT NOT NULL CHECK(priority IN ('indispensable', 'importante', 'no_prioritario')),
    amount REAL NOT NULL CHECK(amount > 0),
    invoice_path TEXT,
    note TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
);

-- Índices para optimizar consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_priority ON transactions(priority);
