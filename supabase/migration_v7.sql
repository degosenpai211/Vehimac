-- Fotos de OT — TEMPORAL: archivos en Supabase Storage bucket ot-photos
-- VPS: dejar de usar Storage; guardar archivos en /var/www/vehimac/uploads/
--      y servirlos con Nginx. La tabla order_photos se mantiene (solo cambia `path`).

CREATE TABLE IF NOT EXISTS order_photos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    work_order_id UUID NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_photos_order ON order_photos(work_order_id);

GRANT ALL ON order_photos TO service_role;

-- Bucket privado; el backend (service role) sube y genera URLs firmadas.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'ot-photos',
    'ot-photos',
    false,
    5242880,
    ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
