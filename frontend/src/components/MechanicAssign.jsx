import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api, formatOT } from '../services/api'
import { PROCESS_STEPS, boliviaNow } from '../utils/process'
import { useToast } from './Toast'

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
  const [saving, setSaving] = useState(false)
  const order = (board || []).find((row) => row.id === orderId)
  const pieces = order?.pieces || []

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
        <select className="input text-sm" value={orderId} onChange={(event) => { setOrderId(event.target.value); setItemId('') }}>
          <option value="">Orden en curso</option>
          {(board || []).map((row) => (
            <option key={row.id} value={row.id}>{formatOT(row)} · {row.client_name || 'Sin cliente'}</option>
          ))}
        </select>
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
