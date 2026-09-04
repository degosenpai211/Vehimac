-- Salarios: sueldo acordado en Equipo + pago como gasto en Finanzas
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE mechanics
    ADD COLUMN IF NOT EXISTS salary_base NUMERIC(12, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS salary_mode TEXT NOT NULL DEFAULT 'both',
    ADD COLUMN IF NOT EXISTS salary_period TEXT NOT NULL DEFAULT 'monthly',
    ADD COLUMN IF NOT EXISTS pay_day INTEGER NOT NULL DEFAULT 30;

DO $$ BEGIN
    ALTER TABLE mechanics ADD CONSTRAINT mechanics_salary_mode_check
        CHECK (salary_mode IN ('fixed', 'per_job', 'both'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    ALTER TABLE mechanics ADD CONSTRAINT mechanics_salary_period_check
        CHECK (salary_period IN ('weekly', 'biweekly', 'monthly'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE finances
    ADD COLUMN IF NOT EXISTS mechanic_id UUID REFERENCES mechanics(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS salary_period_key TEXT;

CREATE INDEX IF NOT EXISTS idx_finances_mechanic ON finances (mechanic_id);
CREATE INDEX IF NOT EXISTS idx_finances_salary_period ON finances (salary_period_key);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
