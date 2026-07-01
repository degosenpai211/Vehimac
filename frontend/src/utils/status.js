export const ORDER_STATUS = {
  en_proceso: { label: 'En proceso', color: 'bg-amber-100 text-amber-900 border-amber-300' },
  terminado: { label: 'Terminado (sin recoger)', color: 'bg-blue-100 text-blue-900 border-blue-300' },
  entregado: { label: 'Entregado', color: 'bg-emerald-100 text-emerald-900 border-emerald-300' },
}

export const STATUS_COLUMNS = [
  {
    id: 'en_proceso',
    title: 'En proceso',
    subtitle: 'Trabajo en curso',
    countLabel: (n) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`,
    header: 'bg-amber-500 text-white',
    column: 'bg-amber-50 border-2 border-amber-300',
    dropHover: 'bg-amber-100',
    cardBorder: 'border-l-4 border-l-amber-500',
    badge: 'bg-amber-600 text-white',
    dot: 'bg-amber-400',
  },
  {
    id: 'terminado',
    title: 'Terminado',
    subtitle: 'Listo — cliente no recogió',
    countLabel: (n) => `${n} ${n === 1 ? 'pieza' : 'piezas'}`,
    header: 'bg-blue-600 text-white',
    column: 'bg-blue-50 border-2 border-blue-300',
    dropHover: 'bg-blue-100',
    cardBorder: 'border-l-4 border-l-blue-600',
    badge: 'bg-blue-700 text-white',
    dot: 'bg-blue-400',
  },
  {
    id: 'entregado',
    title: 'Entregado',
    subtitle: 'Cliente ya recogió',
    countLabel: (n) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`,
    header: 'bg-emerald-600 text-white',
    column: 'bg-emerald-50 border-2 border-emerald-300',
    dropHover: 'bg-emerald-100',
    cardBorder: 'border-l-4 border-l-emerald-600',
    badge: 'bg-emerald-700 text-white',
    dot: 'bg-emerald-400',
  },
]

export const PAYMENT_METHODS = {
  contado: 'Al contado',
  tarjeta_qr: 'Tarjeta / QR',
  adelanto: 'Adelanto',
}
