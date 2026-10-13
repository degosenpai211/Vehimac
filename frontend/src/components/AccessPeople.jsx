import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useToast } from './Toast'
import { ROLE_ADMIN, ROLE_CO_ADMIN, ROLE_LABEL } from '../auth/roles'
import { api } from '../services/api'

const EMPTY_FORM = { name: '', email: '', role: ROLE_CO_ADMIN }

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

export default function AccessPeople({ currentUserId, onSelfUpdated }) {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = () => {
    setLoading(true)
    api.listAccessUsers()
      .then(setRows)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const onInvite = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const created = await api.inviteAccessUser(form)
      setRows((current) => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
      setForm(EMPTY_FORM)
      toast('Invitación enviada. Le llega un correo para crear la clave.')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const onToggle = async (row) => {
    try {
      const updated = await api.updateAccessUser(row.id, { active: !row.active })
      setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const onRole = async (row, role) => {
    if (role === row.role) return
    try {
      const updated = await api.updateAccessUser(row.id, { role })
      setRows((current) => current.map((item) => (item.id === updated.id ? updated : item)))
      if (row.id === currentUserId && onSelfUpdated) await onSelfUpdated()
      toast(`${updated.name} ahora es ${ROLE_LABEL[updated.role] || updated.role}`)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <section className="card p-5 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-brand-700" />
          <h2 className="font-semibold">Quién entra al ERP</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Los invitás vos y les podés cambiar el rol: administrador o co-administrador.
        </p>
      </div>

      <form onSubmit={onInvite} className="grid sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="label" htmlFor="invite-name">Nombre</label>
          <input
            id="invite-name"
            className="input"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoComplete="name"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="invite-email">Correo</label>
          <input
            id="invite-email"
            type="email"
            className="input"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            autoComplete="off"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="invite-role">Rol</label>
          <select
            id="invite-role"
            className="input"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value={ROLE_CO_ADMIN}>{ROLE_LABEL[ROLE_CO_ADMIN]}</option>
            <option value={ROLE_ADMIN}>{ROLE_LABEL[ROLE_ADMIN]}</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Enviando…' : 'Invitar'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando personas…</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <li key={row.id} className="py-3 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="h-10 w-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center text-sm font-semibold shrink-0">
                  {initialsOf(row.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{row.name}</p>
                  <p className="text-xs text-slate-500 truncate">{row.email || 'Sin correo en Auth'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 sm:shrink-0">
                <select
                  className="input py-2 text-sm w-[11.5rem]"
                  value={row.role}
                  onChange={(e) => onRole(row, e.target.value)}
                  aria-label={`Rol de ${row.name}`}
                >
                  <option value={ROLE_CO_ADMIN}>{ROLE_LABEL[ROLE_CO_ADMIN]}</option>
                  <option value={ROLE_ADMIN}>{ROLE_LABEL[ROLE_ADMIN]}</option>
                </select>
                <button
                  type="button"
                  className={`btn-sm ${row.active ? 'btn-secondary' : 'btn-primary'}`}
                  onClick={() => onToggle(row)}
                  disabled={row.id === currentUserId}
                >
                  {row.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
