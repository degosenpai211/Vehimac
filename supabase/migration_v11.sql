-- Proceso de OT por pieza: Diseño, Soldadura, Afinado, Pintura, Instalación
-- Ejecutar en Supabase SQL Editor.

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS process JSONB NOT NULL DEFAULT '{}'::jsonb;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
