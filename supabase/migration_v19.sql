-- Perfiles de acceso al ERP (Supabase Auth).
-- No es Equipo: mechanics.role sigue siendo el puesto en el taller.
-- Ejecutar en Supabase SQL Editor DESPUÉS de crear usuarios en Authentication.
-- Ejemplo:
-- INSERT INTO perfiles_usuario (user_id, rol, nombre, activo)
-- VALUES ('<uuid de auth.users>', 'admin', 'Nombre', true);

CREATE TABLE IF NOT EXISTS perfiles_usuario (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    rol TEXT NOT NULL CHECK (rol IN ('admin', 'co_admin')),
    nombre TEXT NOT NULL,
    activo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_perfiles_usuario_rol ON perfiles_usuario (rol);

ALTER TABLE perfiles_usuario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS perfiles_usuario_leer_propio ON perfiles_usuario;
CREATE POLICY perfiles_usuario_leer_propio
    ON perfiles_usuario
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

GRANT ALL ON TABLE perfiles_usuario TO service_role;
GRANT SELECT ON TABLE perfiles_usuario TO authenticated;
