-- Unificar fichas duplicadas y sacar los 2 pagos dobles (Anghelo y Rider).
-- Pegar TODO junto en SQL Editor y Run.

BEGIN;

-- Anghelo: se pagó 2165 dos veces el 15/09 (mecánico viejo + admin nuevo).
-- Se deja el pago del admin y se borra el del mecánico.
DELETE FROM finances
WHERE id = '1d57fedd-e4e8-4d8a-bfa1-352ec0dbc54d';

UPDATE mechanics
SET active = false
WHERE id IN (
    'cd3a739a-1c4a-4d57-9d19-faaeb9cefe63',
    '6755883b-711a-4d9c-b85b-51c084d79be2'
);

-- Rider: se pagó 2500 dos veces el 15/09 (diseñador viejo + admin nuevo).
DELETE FROM finances
WHERE id = '9307c10c-e8dc-430b-9383-b60a238ec0b3';

UPDATE mechanics
SET active = false
WHERE id = '3bc67edd-25d3-4569-b8fc-aebd1d7ce0d9';

-- Franz: los 3 pagos semanales están en el diseñador. El admin del 22/09 está vacío.
UPDATE mechanics
SET role = 'admin', active = true
WHERE id = '52cdd12f-3f5c-4a4e-ad95-8c56565e18de';

UPDATE mechanics
SET active = false
WHERE id = '774ca079-ba8b-4bf5-a0fc-620074ff9e2c';

-- Marcelo: el pago está en el mecánico. El admin del 22/09 está vacío y también activo.
UPDATE mechanics
SET role = 'admin', active = true
WHERE id = '9fcc3a82-2061-4b28-a2b1-1cddde3e4fb9';

UPDATE mechanics
SET active = false
WHERE id = 'a356b702-17e0-4db8-8aa6-ff35080d4b0a';

COMMIT;

-- Verificar: una sola ficha activa por persona.
SELECT name, role, active, salary_period, salary_base, id
FROM mechanics
WHERE name IN (
    'Anghelo Ureña',
    'Franz Calvimontes',
    'Marcelo Calvimontes',
    'Rider Alvarado'
)
ORDER BY name, active DESC, created_at;
