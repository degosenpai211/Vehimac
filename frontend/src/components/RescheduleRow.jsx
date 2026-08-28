import { useState } from 'react'
import { CalendarClock } from 'lucide-react'
import { api, formatDate, formatOT, openWhatsApp } from '../services/api'
import { useToast } from './Toast'

const STEPS = [
  { days: 1, label: '+1' },
  { days: 2, label: '+2' },
  { days: 3, label: '+3' },
  { days: 4, label: '+4' },
  { days: 5, label: '+5' },
  { days: 7, label: '+1 sem' },
]

function addDays(iso, days) {
  const base = iso ? new Date(`${iso}T12:00:00`) : new Date()
  base.setDate(base.getDate() + days)
  const y = base.getFullYear()
  const m = String(base.getMonth() + 1).padStart(2, '0')
  const d = String(base.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export default function RescheduleRow({ order, onDone }) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const apply = async (days) => {
    const from = order.estimated_delivery_date
    const next = addDays(from, days)
    setSaving(true)
    try {
      await api.updateWorkOrder(order.id, { estimated_delivery_date: next })
      toast(`Entrega movida al ${formatDate(next)}`, 'success')
      setOpen(false)
      onDone?.()
      const phone = order.client?.whatsapp || order.client?.phone
      const msg = `Hola, la ${formatOT(order)} se reprograma: nueva fecha de entrega ${formatDate(next)}${from ? ` (antes ${formatDate(from)})` : ''}.`
      if (phone && confirm('¿Avisar al cliente por WhatsApp?')) {
        openWhatsApp(phone, msg)
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="mt-2"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-700 min-h-[44px] sm:min-h-0 px-1"
        onClick={() => setOpen((v) => !v)}
      >
        <CalendarClock size={13} /> Reprogramar
      </button>
      {open && (
        <div className="flex flex-wrap gap-1 mt-1">
          {STEPS.map((s) => (
            <button
              key={s.days}
              type="button"
              disabled={saving}
              onClick={() => apply(s.days)}
              className="min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 px-2 py-1 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
            >
              {s.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
