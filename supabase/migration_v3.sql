-- Vehimac Fase 1 - OT, piezas múltiples, adelantos
-- Ejecutar en Supabase SQL Editor (proyecto existente)

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS ot_number INTEGER UNIQUE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS advance_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS advance_recorded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS delivery_payment_recorded BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    part_name TEXT,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    mechanic TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(work_order_id);
CREATE INDEX IF NOT EXISTS idx_work_orders_ot ON work_orders(ot_number);

-- Secuencia OT (continúa desde max existente)
CREATE SEQUENCE IF NOT EXISTS ot_number_seq START 1;

SELECT setval(
    'ot_number_seq',
    GREATEST(COALESCE((SELECT MAX(ot_number) FROM work_orders), 0), 1)
);

GRANT ALL ON order_items TO service_role;
GRANT USAGE, SELECT ON SEQUENCE ot_number_seq TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
