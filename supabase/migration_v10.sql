-- Diseñadores en Equipo + campo diseñador en OT / piezas
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'mechanic';

DO $$ BEGIN
    ALTER TABLE mechanics ADD CONSTRAINT mechanics_role_check
        CHECK (role IN ('mechanic', 'designer'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_mechanics_role ON mechanics (role);

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS designer TEXT;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS designer TEXT;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
