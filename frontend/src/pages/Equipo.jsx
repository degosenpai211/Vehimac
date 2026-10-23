import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, UserMinus, UserPlus, ClipboardList } from 'lucide-react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api, formatOT } from '../services/api'
import MechanicSheet from '../components/MechanicLoad'
import { PROCESS_STEPS } from '../utils/process'

const UNASSIGNED_PAGE = 5
const QUIET_RELOAD_MS = 60_000

function missingLabels(ids) {
  return (ids || []).map((id) => PROCESS_STEPS.find((step) => step.id === id)?.label || id)
}

function UnassignedOrders({ orders }) {
  const [page, setPage] = useState(0)
  if (!orders.length) return null
  const pageCount = Math.max(1, Math.ceil(orders.length / UNASSIGNED_PAGE))
  const current = Math.min(page, pageCount - 1)
  const visible = orders.slice(current * UNASSIGNED_PAGE, current * UNASSIGNED_PAGE + UNASSIGNED_PAGE)
  const from = current * UNASSIGNED_PAGE + 1
  const to = Math.min(orders.length, (current + 1) * UNASSIGNED_PAGE)
  return (
    <section className="card p-4">
      <h2 className="text-lg font-semibold">En curso sin técnico en los 5 pasos</h2>
      <ul className="mt-2 divide-y divide-slate-100">
        {visible.map((order) => (
          <li key={order.id} className="py-2">
            <Link to={`/ordenes?order=${order.id}`} className="text-sm font-semibold text-brand-700">
              {formatOT(order)}
            </Link>
            <span className="text-sm text-slate-600"> · {order.client_name || 'Sin cliente'}</span>
            {order.work_description && (
              <p className="text-xs text-slate-500">{order.work_description}</p>
            )}
            {(order.pieces || []).map((piece, index) => (
              <p key={`${piece.part_name}-${index}`} className="text-xs text-slate-600 mt-1">
                {piece.part_name || 'Sin pieza'}: {missingLabels(piece.missing).join(', ')}
              </p>
            ))}
          </li>
        ))}
      </ul>
      {orders.length > UNASSIGNED_PAGE && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Anteriores
          </button>
          <p className="text-xs text-slate-500">{from}–{to} de {orders.length}</p>
          <button
            type="button"
            className="btn-secondary btn-sm"
            disabled={current >= pageCount - 1}
            onClick={() => setPage(current + 1)}
          >
            Siguientes
          </button>
        </div>
      )}
    </section>
  )
}

function StaffList({ title, hint, placeholder, role, emptyTitle, emptyHint, rows, loading, onCreated, onToggled, onViewOrders, loadOf }) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const createdLabel = {
    designer: 'Diseñador agregado',
    admin: 'Administrativo agregado',
    mechanic: 'Mecánico agregado',
  }[role] || 'Integrante agregado'

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.createMechanic({ name: name.trim(), role })
      setName('')
      toast(createdLabel, 'success')
      onCreated?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (m) => {
    try {
      await api.updateMechanic(m.id, { active: !m.active })
      toast(m.active ? 'Desactivado' : 'Reactivado', 'success')
      onToggled?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>

      <form onSubmit={handleCreate} className="card p-4 flex gap-2">
        <input
          className="input flex-1"
          placeholder={placeholder}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" disabled={saving} className="btn-primary">
          <Plus size={16} /> Agregar
        </button>
      </form>

      {loading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyHint} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className={`font-medium ${m.active ? '' : 'text-slate-400 line-through'}`}>{m.name}</p>
                <p className="text-xs text-slate-400">
                  {m.active ? 'Activo' : 'Inactivo'}
                  {loadOf?.(m) ? ` · ${loadOf(m).open} en curso` : ''}
                  {loadOf?.(m)?.overdue > 0 && (
                    <span className="text-red-700"> · {loadOf(m).overdue} atrasadas</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {onViewOrders && (
                  <button type="button" onClick={() => onViewOrders(m)} className="btn-secondary btn-sm">
                    <ClipboardList size={14} /> Ver órdenes
                  </button>
                )}
                <button type="button" onClick={() => toggleActive(m)} className="btn-secondary btn-sm">
                  {m.active ? <><UserMinus size={14} /> Desactivar</> : <><UserPlus size={14} /> Reactivar</>}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Equipo() {
  const [rows, setRows] = useState([])
  const [workload, setWorkload] = useState([])
  const [unassigned, setUnassigned] = useState([])
  const [board, setBoard] = useState([])
  const selectedId = useRef('')
  const [loading, setLoading] = useState(true)
  const [showInactive, setShowInactive] = useState(false)
  const [selected, setSelected] = useState(null)
  const loadedAt = useRef(0)
  const { toast } = useToast()

  const load = (quiet = false) => {
    if (!quiet) setLoading(true)
    Promise.all([
      api.getMechanics({ active_only: !showInactive, limit: 200 }),
      api.getMechanicWorkload().catch((err) => {
        toast(err.message, 'error')
        return { people: [], unassigned: [] }
      }),
    ])
      .then(([people, payload]) => {
        const body = Array.isArray(payload) ? { people: payload, unassigned: [] } : (payload || {})
        setRows(people)
        setWorkload(body.people || [])
        setUnassigned(body.unassigned || [])
        setBoard(body.open_orders || [])
        if (selectedId.current) {
          const fresh = (body.people || []).find((row) => row.id === selectedId.current)
          if (fresh) setSelected(fresh)
        }
        loadedAt.current = Date.now()
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [showInactive])

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - loadedAt.current < QUIET_RELOAD_MS) return
      load(true)
    }
    document.addEventListener('visibilitychange', refresh)
    return () => document.removeEventListener('visibilitychange', refresh)
  }, [showInactive])

  const mechanics = rows.filter((m) => (m.role || 'mechanic') === 'mechanic')
  const designers = rows.filter((m) => m.role === 'designer')
  const admins = rows.filter((m) => m.role === 'admin')

  const loadOf = (person) => workload.find((row) => row.id === person.id)
    || workload.find((row) => row.name.toLowerCase() === person.name.toLowerCase())

  const openOrders = (person) => {
    const found = loadOf(person)
    const next = {
      ...(found || {
        id: person.id,
        name: person.name,
        total: 0,
        open: 0,
        overdue: 0,
        delivered: 0,
        orders: [],
      }),
      labor_efficiency: found?.labor_efficiency ?? person.labor_efficiency ?? 0.6,
    }
    selectedId.current = next.id
    setSelected(next)
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-slate-500">Mecánicos, diseñadores y personal administrativo. No se borran: se desactivan para conservar el historial. El sueldo se carga en Finanzas → Salarios.</p>
      </div>
      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Mostrar desactivados
      </label>
      <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-8">
        <StaffList
          title="Mecánicos"
          hint="Se asignan en cada pieza de la orden de trabajo."
          placeholder="Nombre del mecánico"
          role="mechanic"
          emptyTitle="Sin mecánicos"
          emptyHint="Agregá el primero para usar el autocompletado en las órdenes."
          rows={mechanics}
          loading={loading}
          onCreated={load}
          onToggled={load}
          onViewOrders={openOrders}
          loadOf={loadOf}
        />
        <StaffList
          title="Diseñadores"
          hint="Se asignan en cada pieza, igual que el mecánico."
          placeholder="Nombre del diseñador"
          role="designer"
          emptyTitle="Sin diseñadores"
          emptyHint="Agregá el primero para asignarlo en las órdenes."
          rows={designers}
          loading={loading}
          onCreated={load}
          onToggled={load}
          onViewOrders={openOrders}
          loadOf={loadOf}
        />
        <StaffList
          title="Personal administrativo"
          hint="No se asignan a las órdenes. El sueldo se carga en Finanzas → Salarios."
          placeholder="Nombre del administrativo"
          role="admin"
          emptyTitle="Sin personal administrativo"
          emptyHint="Agregá secretaría, recepción u otro personal de oficina."
          rows={admins}
          loading={loading}
          onCreated={load}
          onToggled={load}
        />
      </div>
      <UnassignedOrders orders={unassigned} />
      <MechanicSheet
        person={selected}
        board={board}
        onClose={() => { selectedId.current = ''; setSelected(null) }}
        onChanged={() => load(true)}
      />
    </div>
  )
}
