-- Personal administrativo en Equipo (mismo catálogo mechanics, rol admin)
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE mechanics ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'mechanic';

ALTER TABLE mechanics DROP CONSTRAINT IF EXISTS mechanics_role_check;

ALTER TABLE mechanics ADD CONSTRAINT mechanics_role_check
    CHECK (role IN ('mechanic', 'designer', 'admin'));

CREATE INDEX IF NOT EXISTS idx_mechanics_role ON mechanics (role);

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
