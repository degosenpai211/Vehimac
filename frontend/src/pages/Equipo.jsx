import { useEffect, useState } from 'react'
import { Plus, UserMinus, UserPlus } from 'lucide-react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api } from '../services/api'

export default function Equipo() {
  const [mechanics, setMechanics] = useState([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    api.getMechanics({ active_only: !showInactive, limit: 200 })
      .then(setMechanics)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [showInactive])

  const handleCreate = async (e) => {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      await api.createMechanic({ name: name.trim() })
      setName('')
      toast('Mecánico agregado', 'success')
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

  if (loading) return <Loading />

  return (
    <div className="space-y-4 max-w-xl">
      <div>
        <h1 className="text-2xl font-bold">Equipo</h1>
        <p className="text-sm text-slate-500">Mecánicos del taller. No se borran: se desactivan para conservar el historial.</p>
      </div>

      <form onSubmit={handleCreate} className="card p-4 flex gap-2">
        <input
          className="input flex-1"
          placeholder="Nombre del mecánico"
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

      {mechanics.length === 0 ? (
        <EmptyState title="Sin mecánicos" description="Agregá el primero para usar el autocompletado en las órdenes." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {mechanics.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-3">
              <div>
                <p className={`font-medium ${m.active ? '' : 'text-slate-400 line-through'}`}>{m.name}</p>
                <p className="text-xs text-slate-400">{m.active ? 'Activo' : 'Inactivo'}</p>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(m)}
                className="btn-secondary btn-sm"
              >
                {m.active ? <><UserMinus size={14} /> Desactivar</> : <><UserPlus size={14} /> Reactivar</>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
