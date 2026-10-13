-- Cuentas del ERP (login). No es Equipo / mechanics.role.
-- Ejecutar en Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS app_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL,
    full_name TEXT NOT NULL,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('administrativo', 'supervisor')),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_app_users_email_lower
    ON app_users (lower(email));

ALTER TABLE app_users ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE app_users TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
