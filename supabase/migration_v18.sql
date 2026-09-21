-- Fecha desde la que corre el período de sueldo (semana / quincena / mes).
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE mechanics
    ADD COLUMN IF NOT EXISTS work_started_on DATE;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
