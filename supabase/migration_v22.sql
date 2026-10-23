-- Efectividad de cada persona y el historial de cambios.
-- Las tarifas de la hoja quedan fijas en el programa.
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE mechanics
    ADD COLUMN IF NOT EXISTS labor_efficiency NUMERIC(6, 4) NOT NULL DEFAULT 0.6;

DO $$ BEGIN
    ALTER TABLE mechanics ADD CONSTRAINT mechanics_labor_efficiency_check
        CHECK (labor_efficiency >= 0.01 AND labor_efficiency <= 1);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS rate_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL CHECK (kind IN ('efficiency', 'margin')),
    mechanic_id UUID REFERENCES mechanics(id) ON DELETE CASCADE,
    previous_value NUMERIC(12, 4) NOT NULL,
    next_value NUMERIC(12, 4) NOT NULL,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rate_changes_kind ON rate_changes (kind, changed_at DESC);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
