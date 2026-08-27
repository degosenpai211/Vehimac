import { Link } from 'react-router-dom'
import { formatDate, formatOT } from '../services/api'

const STATUS_NOTE = {
  en_proceso: 'En proceso',
  terminado: 'Para recoger',
}

export default function AgendaList({ title, items, tone = 'amber', period }) {
  if (!items?.length) return null
  const box = {
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    blue: 'border-sky-200 bg-sky-50 text-sky-950',
    slate: 'border-slate-200 bg-white text-slate-800',
  }[tone]
  const to = period ? `/ordenes?period=${period}` : '/ordenes'
  return (
    <div className={`card p-4 border ${box}`}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <h2 className="font-semibold">{title} <span className="font-normal opacity-70">({items.length})</span></h2>
        <Link to={to} className="text-sm text-brand-700 hover:underline shrink-0">Ver en tablero</Link>
      </div>
      <ul className="space-y-2 text-sm">
        {items.map((o) => (
          <li key={o.id} className="flex justify-between gap-2">
            <span>
              <b>{formatOT(o)}</b> {o.work_description}
              {o.client_name ? ` — ${o.client_name}` : ''}
              {STATUS_NOTE[o.status] && (
                <span className="ml-1 text-[11px] opacity-70">({STATUS_NOTE[o.status]})</span>
              )}
            </span>
            <span className="font-medium shrink-0">{formatDate(o.estimated_delivery_date)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
