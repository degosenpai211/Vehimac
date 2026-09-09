-- Prospectos en proforma: no entran a clients hasta que acepten o se convierta a OT.
-- Si no aceptan, la proforma (y los datos) se borran a los 7 días o a mano.

ALTER TABLE proformas ADD COLUMN IF NOT EXISTS prospect_name TEXT;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS prospect_phone TEXT;
ALTER TABLE proformas ADD COLUMN IF NOT EXISTS prospect_expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_proformas_prospect_expires
    ON proformas (prospect_expires_at)
    WHERE client_id IS NULL AND prospect_expires_at IS NOT NULL;
