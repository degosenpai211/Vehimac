-- Vehimac ERP - Esquema principal (SOLO proyecto NUEVO, sin tablas previas)
-- Si ya tenés tablas, usá migration_v2.sql en su lugar

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

DO $$ BEGIN
    CREATE TYPE work_order_status AS ENUM ('en_proceso', 'terminado', 'entregado');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE finance_type AS ENUM ('ingreso', 'gasto');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    phone TEXT,
    whatsapp TEXT,
    balance DECIMAL(12, 2) NOT NULL DEFAULT 0,
    payment_method TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    balance_updated_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    make TEXT,
    model TEXT,
    year INTEGER,
    plate TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS work_orders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    vehicle_type TEXT,
    part_description TEXT,
    work_description TEXT NOT NULL,
    price_charged DECIMAL(12, 2) NOT NULL DEFAULT 0,
    mechanic TEXT,
    status work_order_status NOT NULL DEFAULT 'en_proceso',
    entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
    estimated_delivery_date DATE,
    finance_recorded BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS finances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    type finance_type NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    category TEXT DEFAULT 'General',
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS clients_updated_at ON clients;
CREATE TRIGGER clients_updated_at BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS work_orders_updated_at ON work_orders;
CREATE TRIGGER work_orders_updated_at BEFORE UPDATE ON work_orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Índices (tablas nuevas ya incluyen todas las columnas)
CREATE INDEX IF NOT EXISTS idx_clients_name ON clients(name);
CREATE INDEX IF NOT EXISTS idx_clients_updated ON clients(updated_at);
CREATE INDEX IF NOT EXISTS idx_clients_balance_updated ON clients(balance_updated_at);
CREATE INDEX IF NOT EXISTS idx_vehicles_client ON vehicles(client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_status ON work_orders(status);
CREATE INDEX IF NOT EXISTS idx_work_orders_client ON work_orders(client_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_entry_date ON work_orders(entry_date);
CREATE INDEX IF NOT EXISTS idx_work_orders_estimated ON work_orders(estimated_delivery_date);
CREATE INDEX IF NOT EXISTS idx_finances_date ON finances(date);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
