-- Vehimac: facturación/IVA + mecánicos
-- Ejecutar en Supabase SQL Editor (proyecto existente). No toca .env de producción.

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS billing_type TEXT NOT NULL DEFAULT 'sin_factura';
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS iva_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;

DO $$ BEGIN
    ALTER TABLE work_orders ADD CONSTRAINT work_orders_billing_type_check
        CHECK (billing_type IN ('con_factura', 'sin_factura'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE work_orders
SET total_amount = price_charged
WHERE total_amount = 0 AND price_charged IS NOT NULL;

CREATE TABLE IF NOT EXISTS mechanics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mechanics_name ON mechanics (name);
CREATE INDEX IF NOT EXISTS idx_mechanics_active ON mechanics (active);
CREATE INDEX IF NOT EXISTS idx_work_orders_billing ON work_orders (billing_type);
CREATE INDEX IF NOT EXISTS idx_work_orders_delivery ON work_orders (estimated_delivery_date);

GRANT ALL ON mechanics TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
