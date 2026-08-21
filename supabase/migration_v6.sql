-- Proformas (cotización = el comprobante; proforma = el registro)
-- Ejecutar en Supabase SQL Editor. No toca .env de producción.

CREATE TABLE IF NOT EXISTS proformas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    number INTEGER UNIQUE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    description TEXT,
    billing_type TEXT NOT NULL DEFAULT 'sin_factura',
    neto_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    iva_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pendiente',
    work_order_id UUID REFERENCES work_orders(id) ON DELETE SET NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$ BEGIN
    ALTER TABLE proformas ADD CONSTRAINT proformas_billing_type_check
        CHECK (billing_type IN ('con_factura', 'sin_factura'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE proformas ADD CONSTRAINT proformas_status_check
        CHECK (status IN ('pendiente', 'aprobada', 'rechazada', 'convertida'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS proforma_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    proforma_id UUID NOT NULL REFERENCES proformas(id) ON DELETE CASCADE,
    part_name TEXT,
    description TEXT NOT NULL,
    amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
    mechanic TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proformas_status ON proformas(status);
CREATE INDEX IF NOT EXISTS idx_proformas_client ON proformas(client_id);
CREATE INDEX IF NOT EXISTS idx_proforma_items_proforma ON proforma_items(proforma_id);

DROP TRIGGER IF EXISTS proformas_updated_at ON proformas;
CREATE TRIGGER proformas_updated_at BEFORE UPDATE ON proformas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT ALL ON proformas TO service_role;
GRANT ALL ON proforma_items TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
