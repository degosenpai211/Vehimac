import { useEffect, useState } from 'react'
import { UserPlus } from 'lucide-react'
import { useToast } from './Toast'
import { ROLE_ADMIN, ROLE_CO_ADMIN, ROLE_LABEL } from '../auth/roles'
import { authService } from '../auth/authService'
import { api } from '../services/api'

const EMPTY_APPROVAL = { role: ROLE_CO_ADMIN, password: '' }

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function PendingPerson({ row, approval, saving, onChange, onApprove, onReject }) {
  return (
    <li className="py-3 space-y-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center text-sm font-semibold shrink-0">
          {initialsOf(row.name)}
        </div>
        <div className="min-w-0">
          <p className="font-medium text-slate-900 truncate">{row.name}</p>
          <p className="text-xs text-slate-500 truncate">{row.email}</p>
        </div>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor={`join-role-${row.id}`}>Rol</label>
          <select
            id={`join-role-${row.id}`}
            className="input py-2 text-sm"
            value={approval.role}
            onChange={(event) => onChange({ ...approval, role: event.target.value })}
          >
            <option value={ROLE_CO_ADMIN}>{ROLE_LABEL[ROLE_CO_ADMIN]}</option>
            <option value={ROLE_ADMIN}>{ROLE_LABEL[ROLE_ADMIN]}</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`join-password-${row.id}`}>Clave inicial</label>
          <input
            id={`join-password-${row.id}`}
            type="password"
            className="input py-2 text-sm"
            value={approval.password}
            onChange={(event) => onChange({ ...approval, password: event.target.value })}
            minLength={authService.minPasswordLength}
            autoComplete="new-password"
            placeholder={`Mínimo ${authService.minPasswordLength} caracteres`}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={saving} onClick={onApprove}>
          {saving ? 'Guardando…' : 'Dar acceso'}
        </button>
        <button type="button" className="btn-secondary" disabled={saving} onClick={onReject}>
          Rechazar
        </button>
      </div>
    </li>
  )
}

export default function AccessJoinRequests({ onChanged }) {
  const { toast } = useToast()
  const [rows, setRows] = useState([])
  const [approvals, setApprovals] = useState({})
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState('')

  const load = () => {
    setLoading(true)
    api.listJoinRequests()
      .then((pending) => {
        setRows(pending)
        setApprovals((current) => {
          const next = { ...current }
          pending.forEach((row) => {
            if (!next[row.id]) next[row.id] = { ...EMPTY_APPROVAL }
          })
          return next
        })
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const approvalOf = (rowId) => approvals[rowId] || EMPTY_APPROVAL

  const onApprove = async (row) => {
    const approval = approvalOf(row.id)
    setSavingId(row.id)
    try {
      await api.approveJoinRequest(row.id, {
        role: approval.role,
        password: approval.password,
        name: row.name,
      })
      setRows((current) => current.filter((item) => item.id !== row.id))
      toast(`${row.name} ya puede entrar.`)
      if (onChanged) onChanged()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingId('')
    }
  }

  const onReject = async (row) => {
    setSavingId(row.id)
    try {
      await api.rejectJoinRequest(row.id)
      setRows((current) => current.filter((item) => item.id !== row.id))
      toast('Pedido rechazado')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSavingId('')
    }
  }

  return (
    <section className="card p-5 space-y-4">
      <div>
        <div className="flex items-center gap-2">
          <UserPlus size={18} className="text-brand-700" />
          <h2 className="font-semibold">Quieren unirse</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Entraron con Google y esperan que les des rol y una clave.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Cargando pedidos…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">Nadie está pidiendo acceso ahora.</p>
      ) : (
        <ul className="divide-y divide-slate-100">
          {rows.map((row) => (
            <PendingPerson
              key={row.id}
              row={row}
              approval={approvalOf(row.id)}
              saving={savingId === row.id}
              onChange={(next) => setApprovals((current) => ({ ...current, [row.id]: next }))}
              onApprove={() => onApprove(row)}
              onReject={() => onReject(row)}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
