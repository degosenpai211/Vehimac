-- ============================================================
-- Vehimac - Migración segura (proyecto YA existente)
-- Copiar TODO este bloque en Supabase SQL Editor → Run
-- ============================================================

-- 1) Columnas nuevas en clients (ANTES de índices)
DO $$ BEGIN
    ALTER TABLE clients RENAME COLUMN pending_debt TO balance;
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS balance DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS balance_updated_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS payment_method TEXT;

-- Si balance no existía y pending_debt tampoco, queda en 0 por defecto

-- 2) Columnas nuevas en work_orders
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS finance_recorded BOOLEAN NOT NULL DEFAULT FALSE;

-- 3) Estado finalizado → entregado
DO $$ BEGIN
    ALTER TYPE work_order_status RENAME VALUE 'finalizado' TO 'entregado';
EXCEPTION WHEN OTHERS THEN
    BEGIN
        ALTER TYPE work_order_status ADD VALUE IF NOT EXISTS 'entregado';
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- Migrar filas que aún digan finalizado (por si el rename del enum falló)
UPDATE work_orders
SET status = 'entregado'::work_order_status
WHERE status::text = 'finalizado';

-- 4) Tablas obsoletas
DROP TABLE IF EXISTS work_order_items CASCADE;
DROP TABLE IF EXISTS products CASCADE;

-- 5) Índices (solo después de que existan las columnas)
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at);
CREATE INDEX IF NOT EXISTS idx_clients_balance_updated ON clients(balance_updated_at);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_entry_date ON work_orders(entry_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_estimated ON work_orders(estimated_delivery_date);

-- 6) Permisos
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
