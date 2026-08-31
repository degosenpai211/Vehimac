import { useEffect, useState } from 'react'
import { Plus, UserMinus, UserPlus } from 'lucide-react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api } from '../services/api'

function StaffList({ title, hint, placeholder, role, emptyTitle, emptyHint }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    api.getMechanics({ active_only: !showInactive, limit: 200, role })
      .then(setRows)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [showInactive, role])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.createMechanic({ name: name.trim(), role })
      setName('')
      toast(role === 'designer' ? 'Diseñador agregado' : 'Mecánico agregado', 'success')
      load()
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
      load()
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

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
        Mostrar desactivados
      </label>

      {loading ? <Loading /> : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyHint} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className={`font-medium ${m.active ? '' : 'text-slate-400 line-through'}`}>{m.name}</p>
                <p className="text-xs text-slate-400">{m.active ? 'Activo' : 'Inactivo'}</p>
              </div>
              <button type="button" onClick={() => toggleActive(m)} className="btn-secondary btn-sm">
                {m.active ? <><UserMinus size={14} /> Desactivar</> : <><UserPlus size={14} /> Reactivar</>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Equipo() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-slate-500">Mecánicos y diseñadores. No se borran: se desactivan para conservar el historial.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-8">
        <StaffList
          title="Mecánicos"
          hint="Se asignan en cada pieza de la orden de trabajo."
          placeholder="Nombre del mecánico"
          role="mechanic"
          emptyTitle="Sin mecánicos"
          emptyHint="Agregá el primero para usar el autocompletado en las órdenes."
        />
        <StaffList
          title="Diseñadores"
          hint="Se asignan en cada pieza, igual que el mecánico."
          placeholder="Nombre del diseñador"
          role="designer"
          emptyTitle="Sin diseñadores"
          emptyHint="Agregá el primero para asignarlo en las órdenes."
        />
      </div>
    </div>
  )
}
