-- Listado de pagos de sueldo para revisar antes de borrar.

-- 1) Cada pago: persona, cargo, fecha, monto.
SELECT
    f.id AS pago_id,
    f.date AS fecha,
    m.name AS persona,
    m.role AS cargo,
    CASE m.role
        WHEN 'admin' THEN 'Administrativo'
        WHEN 'designer' THEN 'Diseñador'
        WHEN 'mechanic' THEN 'Mecánico'
        ELSE COALESCE(m.role, 'sin cargo')
    END AS cargo_label,
    m.active AS ficha_activa,
    f.amount AS monto,
    f.salary_period_key AS periodo,
    f.description
FROM finances f
LEFT JOIN mechanics m ON m.id = f.mechanic_id
WHERE f.type = 'gasto'
  AND f.category IN ('Sueldos y salarios', 'Salarios')
ORDER BY f.date, m.name;

-- 2) Resumen: cuántas personas, cuántos pagos, total.
SELECT
    COUNT(DISTINCT f.mechanic_id) AS personas,
    COUNT(*) AS pagos,
    SUM(f.amount) AS total_pagado,
    MIN(f.date) AS desde,
    MAX(f.date) AS hasta
FROM finances f
WHERE f.type = 'gasto'
  AND f.category IN ('Sueldos y salarios', 'Salarios');

-- 3) Cuando el listado esté bien, borrá SOLO esos gastos de sueldo.
--    No toca ingresos ni otros egresos. Descomentá y corré aparte.
-- DELETE FROM finances
-- WHERE type = 'gasto'
--   AND category IN ('Sueldos y salarios', 'Salarios');
