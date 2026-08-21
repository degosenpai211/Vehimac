-- Pago QR confirmado por el taller (el banco no notifica el scan)
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qr_paid BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qr_bank TEXT;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qr_paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS qr_paid_at TIMESTAMPTZ;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
