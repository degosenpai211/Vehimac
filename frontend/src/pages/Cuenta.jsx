import { useState } from 'react'
import { KeyRound, LogOut } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { authService } from '../auth/authService'
import { can, PERMISSION_USUARIOS_GESTIONAR, ROLE_LABEL } from '../auth/roles'
import { AuthPasswordField } from '../components/AuthScreen'
import AccessJoinRequests from '../components/AccessJoinRequests'
import AccessPeople from '../components/AccessPeople'
import { useToast } from '../components/Toast'

function initialsOf(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return 'V'
  return parts.slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

export default function Cuenta() {
  const { user, logout, applyProfile } = useAuth()
  const canManagePeople = can(user, PERMISSION_USUARIOS_GESTIONAR)
  const { toast } = useToast()
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [peopleKey, setPeopleKey] = useState(0)

  const onSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      await authService.updatePassword(password)
      setPassword('')
      toast('Clave actualizada')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Tu cuenta</h1>
        <p className="text-sm text-slate-500 mt-1">Datos de acceso al ERP. No es el puesto de Equipo.</p>
      </div>

      <section className="card p-5 flex items-center gap-4">
        <div className="h-14 w-14 rounded-2xl bg-brand-800 text-white flex items-center justify-center text-lg font-semibold">
          {initialsOf(user?.name)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{user?.name}</p>
          <p className="text-sm text-slate-500 truncate">{user?.email}</p>
          <span className="inline-flex mt-2 text-xs font-medium px-2 py-1 rounded-full bg-brand-50 text-brand-800">
            {ROLE_LABEL[user?.role] || user?.role}
          </span>
        </div>
      </section>

      <section className="card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-brand-700" />
          <h2 className="font-semibold">Cambiar clave</h2>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <AuthPasswordField
            id="account-password"
            label="Clave nueva"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            minLength={authService.minPasswordLength}
          />
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar clave'}
          </button>
        </form>
      </section>

      {canManagePeople && (
        <>
          <AccessJoinRequests onChanged={() => setPeopleKey((current) => current + 1)} />
          <AccessPeople key={peopleKey} currentUserId={user?.id} onSelfUpdated={applyProfile} />
        </>
      )}

      <button type="button" className="btn-secondary" onClick={logout}>
        <LogOut size={16} /> Cerrar sesión
      </button>
    </div>
  )
}
