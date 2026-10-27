-- Parámetros de la calculadora: eficiencia, margen y plastix.
-- Pegar en Supabase → SQL Editor → Run.

CREATE TABLE IF NOT EXISTS workshop_tariff (
    id SMALLINT PRIMARY KEY,
    rates JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE workshop_tariff ENABLE ROW LEVEL SECURITY;

INSERT INTO workshop_tariff (id, rates)
VALUES (
    1,
    '{"efficiency":0.7,"margin":0.5,"plastix_price":360,"plastix_cm":120}'::jsonb
)
ON CONFLICT (id) DO NOTHING;
