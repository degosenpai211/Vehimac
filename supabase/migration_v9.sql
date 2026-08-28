-- PDF de proformas para WhatsApp (link firmado 7 días)
-- El backend también intenta crear el bucket si no existe.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'proforma-pdfs',
    'proforma-pdfs',
    false,
    8388608,
    ARRAY['application/pdf']
)
ON CONFLICT (id) DO NOTHING;
