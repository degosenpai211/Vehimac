import { Link } from 'react-router-dom'
import { useEffect, useMemo, useState } from 'react'
import Modal from './Modal'
import MechanicAssign from './MechanicAssign'
import { useToast } from './Toast'
import { api, formatCurrency, formatDate, formatOT } from '../services/api'
import { PROCESS_STEPS, STEP_STATUS_META } from '../utils/process'

const STATUS_LABEL = {
  en_proceso: 'En proceso',
  terminado: 'Terminada',
  entregado: 'Entregada',
}

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'En curso' },
  { id: 'overdue', label: 'Atrasadas' },
  { id: 'done', label: 'Completadas' },
]

const MISSING = 'No se registró'
const PAGE_SIZE = 10
const PAY_ROWS = [
  { id: 'mount', label: 'Desmontado / montado', color: '#1d4ed8' },
  { id: 'arm', label: 'Desarmado / armado', color: '#0f766e' },
  { id: 'weld', label: 'Soldadura', color: '#d97706' },
  { id: 'finish', label: 'Afinado', color: '#7c3aed' },
]
const OTHER_PAY = { id: 'other', label: 'Otra pieza', color: '#e11d48' }

function weekRange(today = new Date()) {
  const day = today.getDay()
  const monday = new Date(today)
  monday.setDate(today.getDate() - (day === 0 ? 6 : day - 1))
  const saturday = new Date(monday)
  saturday.setDate(monday.getDate() + 5)
  const iso = (value) => {
    const y = value.getFullYear()
    const m = String(value.getMonth() + 1).padStart(2, '0')
    const d = String(value.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  return { from: iso(monday), to: iso(saturday) }
}

function inWeek(day, range) {
  return Boolean(day) && day >= range.from && day <= range.to
}

function showDay(value) {
  if (!value) return MISSING
  return formatDate(String(value).slice(0, 10))
}

function showHour(value) {
  const match = String(value || '').match(/T(\d{2}:\d{2})/)
  return match ? match[1] : MISSING
}

function touchesWeek(order, range) {
  return inWeek(order.assigned_on, range) || inWeek(order.entry_on, range)
}

function todayIso(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${now.getFullYear()}-${month}-${day}`
}

function doneToday(order, today) {
  if (order.finished_on === today) return true
  return (order.steps || []).some((step) => step.closed_on === today)
}

function payTotals(orders) {
  const totals = { mount: 0, arm: 0, weld: 0, finish: 0, other: 0 }
  for (const order of orders) {
    const pay = order.pay || {}
    for (const key of Object.keys(totals)) {
      totals[key] += Number(pay[key]) || 0
    }
  }
  const rows = PAY_ROWS.map((row) => ({ ...row, amount: totals[row.id] }))
  if (totals.other > 0) rows.push({ ...OTHER_PAY, amount: totals.other })
  const total = rows.reduce((sum, row) => sum + row.amount, 0)
  return { rows, total }
}

function BarTrack({ amount, max, color }) {
  const width = max > 0 && amount > 0 ? Math.max(8, (amount / max) * 100) : 0
  return (
    <div className="h-4 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-4 rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
    </div>
  )
}

function PayChart({ orders }) {
  const { rows, total } = payTotals(orders)
  const max = Math.max(0, ...rows.map((row) => row.amount))
  return (
    <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Trabajado</h3>
          <p className="text-xs text-slate-500">Mano de obra de la hoja. Todavía no reemplaza el sueldo.</p>
        </div>
        <p className="text-xl font-bold text-brand-800 tabular-nums">{formatCurrency(total)}</p>
      </div>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => (
          <li key={row.id}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{row.label}</span>
              <span className="font-semibold tabular-nums">{formatCurrency(row.amount)}</span>
            </div>
            <BarTrack amount={row.amount} max={max} color={row.color} />
          </li>
        ))}
      </ul>
      {total <= 0 && (
        <p className="mt-3 text-xs text-slate-500">Los bolivianos aparecen cuando esa cuenta ya quedó guardada en la pieza. Cambiar la efectividad no borra lo guardado, ni completa lo que no se anotó.</p>
      )}
    </section>
  )
}

const TIME_ROWS = [
  { id: 'mount', label: 'Desmontado / montado' },
  { id: 'arm', label: 'Desarmado / armado' },
  { id: 'weld', label: 'Soldadura' },
  { id: 'finish', label: 'Afinado' },
]

function timeTotals(orders) {
  return TIME_ROWS.map((row) => {
    let allowed = 0
    let actual = 0
    let open = 0
    for (const order of orders) {
      const item = order.time?.[row.id] || {}
      allowed += Number(item.allowed) || 0
      actual += Number(item.actual) || 0
      open += Number(item.open) || 0
    }
    return { ...row, allowed, actual, open }
  }).filter((row) => row.allowed > 0 || row.actual > 0)
}

function TimeChart({ orders }) {
  const rows = timeTotals(orders)
  if (!rows.length) {
    return (
      <section className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-slate-900">Rendimiento</h3>
        <p className="mt-1 text-xs text-slate-500">Aparece cuando hay comisión anotada en las piezas de este filtro.</p>
      </section>
    )
  }
  const max = Math.max(1, ...rows.flatMap((row) => [row.allowed, row.actual]))
  return (
    <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Rendimiento</h3>
      <p className="text-xs text-slate-500">Minutos que se cobran con su efectividad, y minutos que tardó de verdad.</p>
      <ul className="mt-3 space-y-3">
        {rows.map((row) => {
          const timed = row.id === 'weld' || row.id === 'finish'
          const score = timed && row.actual > 0 ? Math.round((row.allowed / row.actual) * 100) : null
          const mark = !timed ? 'Sin hora de cierre' : score === null ? 'Falta el cierre' : `${score}%`
          return (
            <li key={row.id}>
              <div className="mb-1 flex justify-between text-xs text-slate-600">
                <span>{row.label}</span>
                <span className="font-semibold">{mark}</span>
              </div>
              <BarTrack amount={row.allowed} max={max} color="#1d4ed8" />
              <div className="mt-1">
                <BarTrack amount={row.actual} max={max} color="#10b981" />
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Cobrado {Math.round(row.allowed)} min · Real {row.open > 0 && row.actual === 0 ? 'sin cierre' : `${Math.round(row.actual)} min`}
              </p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

const PERIOD_LABEL = { weekly: 'por semana', biweekly: 'por quincena', monthly: 'por mes' }

function showWhen(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('es-BO', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/La_Paz',
  }).format(date)
}

function RateHistory({ rows }) {
  if (!rows?.length) return <p className="mt-2 text-xs text-slate-500">Sin cambios registrados.</p>
  return (
    <ul className="mt-2 space-y-1">
      {rows.map((row) => (
        <li key={row.id || row.changed_at} className="text-xs text-slate-600">
          {showWhen(row.changed_at)} · {Math.round(Number(row.previous_value) * 100)}% → {Math.round(Number(row.next_value) * 100)}%
        </li>
      ))}
    </ul>
  )
}

function EfficiencyBox({ person, onChanged }) {
  const { toast } = useToast()
  const [percent, setPercent] = useState(60)
  const [saving, setSaving] = useState(false)
  const [history, setHistory] = useState([])
  useEffect(() => {
    const current = Math.round((Number(person.labor_efficiency) || 0.6) * 100)
    setPercent(Math.min(100, Math.max(1, current)))
  }, [person.id, person.labor_efficiency])
  useEffect(() => {
    if (!person.id) return undefined
    let cancelled = false
    api.getEfficiencyHistory(person.id)
      .then((rows) => { if (!cancelled) setHistory(Array.isArray(rows) ? rows : []) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [person.id, person.labor_efficiency])

  const save = async () => {
    const next = Math.min(100, Math.max(1, Number(percent) || 60))
    if (!person.id) return
    setSaving(true)
    try {
      await api.updateMechanic(person.id, { labor_efficiency: Math.round(next) / 100 })
      toast('Efectividad guardada', 'success')
      onChanged?.()
      const rows = await api.getEfficiencyHistory(person.id).catch(() => [])
      setHistory(Array.isArray(rows) ? rows : [])
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="rounded-2xl border border-brand-100 bg-brand-50 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">Efectividad</h3>
          <p className="text-xs text-slate-600">Más porcentaje cobra menos tiempo. Menos porcentaje cobra más. Lo ya guardado no cambia.</p>
          <p className="mt-1 text-xs text-slate-700">
            {Number(person.weekly_pay) > 0
              ? `En Finanzas: ${formatCurrency(person.salary_base)} ${PERIOD_LABEL[person.salary_period] || 'por mes'}. Semana contemplada ${formatCurrency(person.weekly_pay)}. Hora con aguinaldo ${formatCurrency(person.hourly_with_bonus)}.`
              : 'En Finanzas no tiene sueldo, así que esta cuenta da 0.'}
          </p>
        </div>
        <p className="text-3xl font-bold text-brand-800 tabular-nums">{percent}%</p>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          type="number"
          min="1"
          max="100"
          className="input text-sm w-24"
          aria-label="Efectividad en porcentaje"
          value={percent}
          onChange={(event) => setPercent(event.target.value)}
        />
        <button type="button" className="btn-primary btn-sm" disabled={saving || !person.id} onClick={save}>
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
      <RateHistory rows={history} />
    </section>
  )
}

function StepChart({ steps }) {
  if (!steps.length) {
    return (
      <section className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="text-base font-semibold text-slate-900">Efectividad</h3>
        <p className="mt-1 text-xs text-slate-500">Sin pasos asignados en este filtro.</p>
      </section>
    )
  }
  return (
    <section className="mt-3 rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="text-base font-semibold text-slate-900">Efectividad</h3>
      <p className="text-xs text-slate-500">Pasos completados sobre los que tiene asignados.</p>
      <ul className="mt-3 space-y-3">
        {steps.map((step) => (
          <li key={step.id}>
            <div className="mb-1 flex justify-between text-xs text-slate-600">
              <span>{step.label}</span>
              <span className="font-semibold tabular-nums">{step.done}/{step.assigned}</span>
            </div>
            <BarTrack amount={step.assigned ? step.done / step.assigned : 0} max={1} color="#10b981" />
          </li>
        ))}
      </ul>
    </section>
  )
}

function Count({ label, value, tone }) {
  const box = {
    red: 'bg-red-50 text-red-700',
    green: 'bg-emerald-50 text-emerald-800',
  }[tone] || 'bg-slate-50 text-slate-800'
  return (
    <div className={`rounded-xl px-3 py-2 min-w-[92px] ${box}`}>
      <p className="text-[11px] uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-xl font-bold tabular-nums leading-tight">{value}</p>
    </div>
  )
}

function stepLabel(id) {
  return PROCESS_STEPS.find((step) => step.id === id)?.label || id || 'Paso'
}

function tallySteps(orders) {
  return PROCESS_STEPS.map((step) => {
    const rows = orders.flatMap((order) => (order.steps || []).filter((item) => item.id === step.id))
    return {
      id: step.id,
      label: step.label,
      assigned: rows.length,
      done: rows.filter((item) => item.status === 'completado').length,
    }
  }).filter((row) => row.assigned > 0)
}

function partsOf(steps) {
  const grouped = new Map()
  for (const step of steps || []) {
    const key = step.part_name || 'Pieza'
    const current = grouped.get(key) || { name: key, amount: Number(step.part_amount) || 0, rows: [] }
    current.rows.push(step)
    grouped.set(key, current)
  }
  return [...grouped.values()]
}

function OrderSteps({ steps, overdue }) {
  if (!steps?.length) {
    return <p className="text-xs text-slate-400 mt-2">Figura en la orden, sin un paso de los cinco a su nombre.</p>
  }
  return (
    <div className="mt-3 space-y-2">
      {partsOf(steps).map((part) => (
        <div key={part.name}>
          <p className="text-xs font-semibold text-slate-700">
            {part.name} · {part.rows.length} de 5 · {formatCurrency(part.amount)}
          </p>
          <ul className="mt-1 space-y-1">
            {part.rows.map((step, index) => {
              const meta = STEP_STATUS_META[step.status] || STEP_STATUS_META.pendiente
              const active = step.status === 'en_proceso'
              const nameClass = active && overdue ? 'font-medium text-red-700' : active ? 'font-medium text-brand-800' : 'font-medium text-slate-800'
              return (
                <li key={`${step.id}-${index}`} className="text-sm text-slate-600">
                  <span className={nameClass}>{stepLabel(step.id)}</span>
                  <span className={`ml-2 px-1.5 py-0.5 rounded-full text-[11px] ${meta.badge}`}>{meta.label}</span>
                  {active && <span className={`ml-2 text-[11px] font-semibold ${overdue ? 'text-red-700' : 'text-brand-700'}`}>Activo</span>}
                  <span className="block text-xs text-slate-500 mt-0.5">
                    Asignado: {showDay(step.assigned_on)} · {showHour(step.assigned_at)}
                    {step.status === 'completado' && (
                      step.closed_on
                        ? ` · Cierre del proceso: ${formatDate(step.closed_on)}`
                        : ' · Completado, sin día de cierre'
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function OrderCard({ order }) {
  const done = order.status === 'entregado'
  const border = order.overdue ? 'border-red-200 bg-red-50/40' : done ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200'
  return (
    <li className={`rounded-xl border p-3 ${border}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-slate-900">{formatOT(order)}</p>
          <p className="text-sm font-semibold text-slate-800">OT {formatCurrency(order.price)}</p>
          {Number(order.pay?.total) > 0 && (
            <p className="text-sm font-semibold text-brand-800">Su parte {formatCurrency(order.pay.total)}</p>
          )}
          <p className="text-sm text-slate-600">{order.client_name || 'Sin cliente'}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-semibold text-slate-900">{showDay(order.assigned_on)}</p>
          <p className="text-[11px] text-slate-400">Asignada · {showHour(order.assigned_at)}</p>
          <p className="text-sm font-semibold text-slate-900 mt-1">{showDay(order.entry_on)}</p>
          <p className="text-[11px] text-slate-400">Ingreso</p>
        </div>
      </div>
      {order.work_description && (
        <p className="text-sm text-slate-600 mt-2">{order.work_description}</p>
      )}
      <p className={`text-xs mt-2 ${order.overdue ? 'text-red-700' : done ? 'text-emerald-800' : 'text-slate-500'}`}>
        {STATUS_LABEL[order.status] || order.status}
        {order.overdue ? ' · Atrasada' : ''}
        {order.estimated_delivery_date ? ` · Prometida ${formatDate(order.estimated_delivery_date)}` : ''}
      </p>
      <Link to={`/ordenes?order=${order.id}`} className="inline-block mt-2 text-sm font-semibold text-brand-700">
        Abrir OT
      </Link>
      <OrderSteps steps={order.steps} overdue={order.overdue} />
    </li>
  )
}

export default function MechanicSheet({ person, board = [], onClose, onChanged }) {
  const [filter, setFilter] = useState('all')
  const [thisWeek, setThisWeek] = useState(false)
  const [onlyToday, setOnlyToday] = useState(false)
  const [page, setPage] = useState(0)
  const range = useMemo(() => weekRange(), [])
  const today = useMemo(() => todayIso(), [])
  useEffect(() => {
    setPage(0)
  }, [filter, thisWeek, onlyToday, person?.id])
  if (!person) return null
  const orders = (person.orders || []).filter((order) => {
    if (filter === 'open' && order.status === 'entregado') return false
    if (filter === 'done' && order.status !== 'entregado') return false
    if (filter === 'overdue' && !order.overdue) return false
    if (thisWeek && !touchesWeek(order, range)) return false
    if (onlyToday && !doneToday(order, today)) return false
    return true
  })
  const pageCount = Math.max(1, Math.ceil(orders.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = orders.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE)
  const from = orders.length === 0 ? 0 : currentPage * PAGE_SIZE + 1
  const to = Math.min(orders.length, (currentPage + 1) * PAGE_SIZE)
  const steps = tallySteps(orders)
  const namedSteps = (person.orders || []).flatMap((order) => order.steps || [])
  const activeSteps = namedSteps.filter((step) => step.status === 'en_proceso').length
  return (
    <Modal open onClose={onClose} title={person.name} size="lg">
      <EfficiencyBox person={person} onChanged={onChanged} />
      <div className="flex flex-wrap gap-2 mt-4">
        <Count label="Recibidas" value={person.total || 0} />
        <Count label="En curso" value={person.open || 0} />
        <Count label="Atrasadas" value={person.overdue || 0} tone="red" />
        <Count label="Completadas" value={person.delivered || 0} tone="green" />
        <Count label="Pasos" value={namedSteps.length} />
        <Count label="Activos" value={activeSteps} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setFilter(item.id)}
            className={`px-3 min-h-[36px] rounded-full text-sm font-medium ${
              filter === item.id ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {item.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setThisWeek((value) => !value)}
          className={`px-3 min-h-[36px] rounded-full text-sm font-medium ${
            thisWeek ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Esta semana
        </button>
        <button
          type="button"
          onClick={() => setOnlyToday((value) => !value)}
          className={`px-3 min-h-[36px] rounded-full text-sm font-medium ${
            onlyToday ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Hoy
        </button>
      </div>
      <PayChart orders={orders} />
      <TimeChart orders={orders} />
      <StepChart steps={steps} />
      <MechanicAssign person={person} board={board} onChanged={onChanged} />
      {orders.length === 0 ? (
        <p className="text-sm text-slate-500 mt-4">Sin órdenes para ese filtro.</p>
      ) : (
        <>
          <ul className="mt-4 space-y-2">
            {visible.map((order) => (
              <OrderCard key={order.id} order={order} />
            ))}
          </ul>
          {orders.length > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between gap-2">
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={currentPage === 0}
                onClick={() => setPage(currentPage - 1)}
              >
                Anteriores
              </button>
              <p className="text-xs text-slate-500">{from}–{to} de {orders.length}</p>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={currentPage >= pageCount - 1}
                onClick={() => setPage(currentPage + 1)}
              >
                Siguientes
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}
