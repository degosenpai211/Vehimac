import { useEffect, useState } from 'react'
import { auth, UNAUTHORIZED_EVENT } from '../services/api'
import Loading from './Loading'
import VehimacLogo from './VehimacLogo'

async function resolveAccess() {
  let status
  try {
    status = await auth.status()
  } catch {
    // Backend viejo o caído: se deja pasar; si pide login, el 401 trae acá.
    return 'open'
  }
  if (!status?.auth_required) return 'open'
  if (!auth.hasSession()) return 'login'
  try {
    await auth.check()
    return 'open'
  } catch {
    return 'login'
  }
}

export default function AuthGate({ children }) {
  const [access, setAccess] = useState('checking')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let alive = true
    resolveAccess().then((result) => { if (alive) setAccess(result) })
    const onUnauthorized = () => setAccess('login')
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => {
      alive = false
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    }
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    setSending(true)
    setError('')
    try {
      await auth.login(password)
      setPassword('')
      setAccess('open')
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión')
    } finally {
      setSending(false)
    }
  }

  if (access === 'checking') return <Loading />
  if (access === 'open') return children

  return (
    <div className="min-h-screen min-h-[100dvh] flex items-center justify-center p-4">
      <form onSubmit={handleSubmit} className="card w-full max-w-sm p-6 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <VehimacLogo size={88} />
          <h1 className="text-lg font-semibold text-brand-800">Vehimac ERP</h1>
        </div>
        <div>
          <label className="label" htmlFor="vehimac-password">Contraseña del taller</label>
          <input
            id="vehimac-password"
            type="password"
            className="input"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
        <button type="submit" className="btn-primary w-full" disabled={sending || !password}>
          {sending ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
