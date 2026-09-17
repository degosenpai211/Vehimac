-- Link corto de proforma para WhatsApp (/p/xxxxxx), válido 30 días.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE proformas
    ADD COLUMN IF NOT EXISTS pdf_short_code TEXT,
    ADD COLUMN IF NOT EXISTS pdf_storage_path TEXT,
    ADD COLUMN IF NOT EXISTS pdf_expires_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_proformas_pdf_short_code
    ON proformas (pdf_short_code)
    WHERE pdf_short_code IS NOT NULL;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
