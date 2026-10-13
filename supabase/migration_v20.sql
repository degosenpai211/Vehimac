-- Pedidos de acceso (Google u otro login sin perfil).
-- El admin aprueba desde Tu cuenta: rol + clave.

CREATE TABLE IF NOT EXISTS solicitudes_acceso (
    user_id UUID PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    nombre TEXT NOT NULL,
    estado TEXT NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_acceso_estado
    ON solicitudes_acceso (estado);

ALTER TABLE solicitudes_acceso ENABLE ROW LEVEL SECURITY;

GRANT ALL ON TABLE solicitudes_acceso TO service_role;
