import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatCurrency, formatOT } from '../services/api'
import { PROCESS_STEPS, boliviaNow } from '../utils/process'
import { useToast } from './Toast'

function pieceLacksMechanic(piece) {
  return PROCESS_STEPS.some((step) => {
    const found = (piece.steps || []).find((row) => row.id === step.id)
    return !String(found?.technician || '').trim()
  })
}

function orderLacksMechanic(order) {
  if ((order.status || 'en_proceso') !== 'en_proceso') return false
  const pieces = order.pieces || []
  if (!pieces.length) return true
  return pieces.some(pieceLacksMechanic)
}

function orderMatches(order, query) {
  const text = query.trim().toLowerCase()
  if (!text) return false
  const compact = text.replace(/\s+/g, '')
  const number = String(order.ot_number ?? '')
  const digits = compact.startsWith('ot') ? compact.slice(2) : compact
  if (/^\d+$/.test(digits) && (compact.startsWith('ot') || compact === digits)) {
    return number === digits || number.startsWith(digits)
  }
  return String(order.client_name || '').toLowerCase().includes(text)
}

function raisedPieces(board) {
  const rows = []
  for (const order of board || []) {
    if ((order.status || 'en_proceso') !== 'en_proceso') continue
    for (const piece of order.pieces || []) {
      if (piece.admin_help) rows.push({ order, piece })
    }
  }
  return rows
}

function joinWhen(day, clock) {
  if (!day) return ''
  if (!clock) return day
  return `${day}T${clock}`
}

function AssignForm({ person, board, onChanged }) {
  const { toast } = useToast()
  const [orderId, setOrderId] = useState('')
  const [itemId, setItemId] = useState('')
  const [stepId, setStepId] = useState('soldadura')
  const [day, setDay] = useState('')
  const [clock, setClock] = useState('')
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)
  const [marking, setMarking] = useState(false)
  const matches = useMemo(() => {
    if (!query.trim()) return []
    return (board || []).filter((row) => orderLacksMechanic(row) && orderMatches(row, query))
  }, [board, query])
  const raised = useMemo(() => raisedPieces(board), [board])
  const order = (board || []).find((row) => row.id === orderId)
  const pieces = order?.pieces || []
  const piece = pieces.find((row) => row.id === itemId)
  const adminHelp = piece?.admin_help === true

  const markHelp = async () => {
    if (!orderId || !itemId) {
      toast('Faltan datos. Revisá lo que cargaste.', 'error')
      return
    }
    setMarking(true)
    try {
      await api.markAdminHelp(orderId, itemId, !adminHelp)
      toast(adminHelp ? 'El cobro volvió al precio de la hoja.' : 'El cobro al cliente sube 25%.', 'success')
      onChanged?.()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setMarking(false)
    }
  }

  const assign = async () => {
    if (!orderId || !itemId || !stepId || !day) {
      toast('Faltan datos. Revisá lo que cargaste.', 'error')
      return
    }
    setSaving(true)
    try {
      await api.assignStep(orderId, itemId, {
        step_id: stepId,
        technician: person.name,
        assigned_at: joinWhen(day, clock),
        status: 'en_proceso',
      })
      toast('Asignado', 'success')
      onChanged?.()
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Asignar</h3>
      <p className="text-xs text-slate-500 mb-3">Queda en la orden, con su nombre, fecha y hora.</p>
      <div className="space-y-2">
        <input
          className="input text-sm"
          placeholder="OT80 o nombre del cliente"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setOrderId('')
            setItemId('')
          }}
        />
        {!orderId && query.trim() && (
          <ul className="max-h-60 overflow-y-auto rounded-lg border border-slate-200">
            {matches.length === 0 && (
              <li className="px-3 py-2 text-sm text-slate-500">Sin órdenes en proceso sin mecánico.</li>
            )}
            {matches.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                  onClick={() => {
                    setOrderId(row.id)
                    setItemId('')
                    setQuery(`${formatOT(row)} · ${row.client_name || 'Sin cliente'}`)
                  }}
                >
                  {formatOT(row)} · {row.client_name || 'Sin cliente'}
                </button>
              </li>
            ))}
          </ul>
        )}
        <select className="input text-sm" value={itemId} onChange={(event) => setItemId(event.target.value)} disabled={!order}>
          <option value="">Pieza</option>
          {pieces.map((piece) => (
            <option key={piece.id || piece.part_name} value={piece.id}>{piece.part_name}</option>
          ))}
        </select>
        <select className="input text-sm" value={stepId} onChange={(event) => setStepId(event.target.value)}>
          {PROCESS_STEPS.map((step) => (
            <option key={step.id} value={step.id}>{step.label}</option>
          ))}
        </select>
        <div className="grid grid-cols-2 gap-2">
          <input type="date" className="input text-sm" aria-label="Fecha de asignación" value={day} onChange={(event) => setDay(event.target.value)} />
          <input type="time" className="input text-sm" aria-label="Hora de asignación" value={clock} onChange={(event) => setClock(event.target.value)} />
        </div>
        <button type="button" className="btn-primary btn-sm" disabled={saving} onClick={assign}>
          {saving ? 'Guardando…' : 'Asignar'}
        </button>
        <button
          type="button"
          className={adminHelp ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
          disabled={marking || !itemId}
          onClick={markHelp}
        >
          {marking ? 'Guardando…' : 'Multiplicador'}
        </button>
        {adminHelp && Number(piece?.quote_total) > 0 && (
          <p className="text-sm text-slate-700">
            Precio de la pieza {formatCurrency(piece.piece_total)} → {formatCurrency(piece.quote_total)}
          </p>
        )}
        {raised.length > 0 && (
          <div>
            <p className="text-sm font-semibold text-slate-800">Piezas con 25% más</p>
            <ul className="mt-1 space-y-1">
              {raised.map(({ order: row, piece: item }) => (
                <li key={item.id || `${row.id}-${item.part_name}`} className="text-sm text-slate-600">
                  {formatOT(row)} · {item.part_name}
                  {Number(item.quote_total) > 0 ? ` · ${formatCurrency(item.piece_total)} → ${formatCurrency(item.quote_total)}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

function openSteps(person) {
  const rows = []
  for (const order of person.orders || []) {
    for (const step of order.steps || []) {
      if (step.status === 'completado') continue
      rows.push({ ...step, order })
    }
  }
  return rows
}

function CurrentWork({ person, onChanged }) {
  const { toast } = useToast()
  const rows = openSteps(person)

  const finish = async (step) => {
    if (!step.item_id || !step.order?.id) return
    try {
      await api.assignStep(step.order.id, step.item_id, {
        step_id: step.id,
        technician: person.name,
        assigned_at: step.assigned_at || '',
        status: 'completado',
        completed_at: boliviaNow(),
      })
      toast('Paso completado', 'success')
      onChanged?.()
    } catch (error) {
      toast(error.message, 'error')
    }
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">En qué está</h3>
      <p className="text-xs text-slate-500 mb-3">Los pasos que tiene abiertos, agrupados por proceso.</p>
      {rows.length === 0 && <p className="text-sm text-slate-500">Sin pasos abiertos.</p>}
      <div className="space-y-3">
        {PROCESS_STEPS.map((meta) => {
          const group = rows.filter((step) => step.id === meta.id)
          if (!group.length) return null
          return (
            <div key={meta.id}>
              <p className="text-sm font-semibold text-slate-800">{meta.label}</p>
              <ul className="mt-1 space-y-1">
                {group.map((step) => (
                  <li key={`${step.order.id}-${step.item_id}-${step.id}`} className="flex items-center justify-between gap-2 text-sm">
                    <span>
                      <Link to={`/ordenes?order=${step.order.id}`} className="font-semibold text-brand-700">{formatOT(step.order)}</Link>
                      <span className="text-slate-600"> · {step.part_name || 'Pieza'}</span>
                    </span>
                    <button type="button" className="btn-secondary btn-sm" disabled={!step.item_id} onClick={() => finish(step)}>
                      Completar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
    </section>
  )
}

export default function MechanicAssign({ person, board, onChanged }) {
  return (
    <div className="mt-4 grid gap-3 lg:grid-cols-2">
      <AssignForm person={person} board={board} onChanged={onChanged} />
      <CurrentWork person={person} onChanged={onChanged} />
    </div>
  )
}
