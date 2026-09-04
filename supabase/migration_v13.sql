-- Estado de resultados: efectivo inicial + alquileres fijos
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS finance_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    cash_opening NUMERIC(12, 2) NOT NULL DEFAULT 0,
    rent_1 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    rent_2 NUMERIC(12, 2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO finance_settings (id, cash_opening, rent_1, rent_2)
VALUES ('default', 0, 0, 0)
ON CONFLICT (id) DO NOTHING;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
