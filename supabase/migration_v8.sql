-- Proforma impresa (plantilla Excel): cantidad, precio unitario y descuento.
-- El PDF NO muestra IVA. iva_amount queda en 0. Al convertir a OT se usa el neto de cada línea.

ALTER TABLE proforma_items ADD COLUMN IF NOT EXISTS quantity DECIMAL(12, 2) NOT NULL DEFAULT 1;
ALTER TABLE proforma_items ADD COLUMN IF NOT EXISTS unit_price DECIMAL(12, 2) NOT NULL DEFAULT 0;
ALTER TABLE proforma_items ADD COLUMN IF NOT EXISTS discount_percent DECIMAL(5, 2) NOT NULL DEFAULT 0;

UPDATE proforma_items
SET unit_price = amount
WHERE unit_price = 0 AND amount <> 0;
