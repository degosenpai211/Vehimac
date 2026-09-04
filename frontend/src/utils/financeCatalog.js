export const FINANCE_GROUPS = [
  { id: 'ingresos', label: 'Ingresos' },
  { id: 'directos', label: 'Costos directos' },
  { id: 'indirectos', label: 'Costos indirectos' },
]

export const FINANCE_CATALOG = [
  { id: 'servicios', label: 'Ingresos por servicios', group: 'ingresos', kind: 'ingreso', source: 'auto' },
  { id: 'otros_ingresos', label: 'Otros ingresos', group: 'ingresos', kind: 'ingreso', source: 'manual' },
  { id: 'filamentos', label: 'Filamentos', group: 'directos', kind: 'gasto', source: 'manual' },
  { id: 'plastic_27', label: 'Plastic 27', group: 'directos', kind: 'gasto', source: 'qr' },
  { id: 'insumos', label: 'Insumos varios', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'sueldos', label: 'Sueldos y salarios', group: 'indirectos', kind: 'gasto', source: 'auto' },
  { id: 'alquiler_1', label: 'Alquiler 1', group: 'indirectos', kind: 'gasto', source: 'rent' },
  { id: 'alquiler_2', label: 'Alquiler 2', group: 'indirectos', kind: 'gasto', source: 'rent' },
  { id: 'servicios_basicos', label: 'Servicios básicos', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'oficina', label: 'Material de escritorio y oficina', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'marketing', label: 'Marketing y publicidad', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'comisiones', label: 'Comisiones', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'mantenimiento', label: 'Mantenimiento de equipos', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'herramientas', label: 'Compra de herramientas y equipos', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'otros_varios', label: 'Otros - Varios', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'otros_egresos', label: 'Otros egresos', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'previsiones', label: 'Previsiones', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'intereses', label: 'Intereses', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'fiscales', label: 'Fiscales', group: 'indirectos', kind: 'gasto', source: 'manual' },
  { id: 'tributarios', label: 'Tributarios', group: 'indirectos', kind: 'gasto', source: 'manual' },
]

export function catalogForType(kind) {
  return FINANCE_CATALOG.filter((c) => c.kind === kind)
}

export function categoryLabel(idOrLabel) {
  const found = FINANCE_CATALOG.find((c) => c.id === idOrLabel || c.label === idOrLabel)
  return found?.label || idOrLabel || ''
}
