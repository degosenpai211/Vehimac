import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { api, UNAUTHORIZED_EVENT } from '../services/api'
import { authService } from './authService'

const AuthContext = createContext(null)

export const JOIN_WAITING_MESSAGE =
  'Pedido enviado. Un administrador te va a dar rol y clave desde Tu cuenta.'
const ACCOUNT_DISABLED_MESSAGE = 'Tu cuenta está desactivada.'
const JOIN_STATUS_READY = 'ready'
const JOIN_STATUS_DISABLED = 'disabled'

function isDeactivated(error) {
  return String(error?.message || '').includes('desactivada')
}

async function profileFromSession() {
  const session = await authService.getSession()
  if (!session) return { user: null, notice: '', noticeKind: 'error' }
  try {
    const me = await api.me()
    return { user: me, notice: '', noticeKind: 'error' }
  } catch (err) {
    if (isDeactivated(err)) {
      await authService.signOut()
      return { user: null, notice: err.message, noticeKind: 'error' }
    }
    if (err.status === 401) {
      return { user: null, notice: err.message, noticeKind: 'error' }
    }
    try {
      const join = await api.requestAccess()
      if (join.status === JOIN_STATUS_READY) {
        const me = await api.me()
        return { user: me, notice: '', noticeKind: 'error' }
      }
      await authService.signOut()
      if (join.status === JOIN_STATUS_DISABLED) {
        return { user: null, notice: ACCOUNT_DISABLED_MESSAGE, noticeKind: 'error' }
      }
      return { user: null, notice: JOIN_WAITING_MESSAGE, noticeKind: 'ok' }
    } catch (joinErr) {
      await authService.signOut()
      return { user: null, notice: joinErr.message || err.message, noticeKind: 'error' }
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notice, setNotice] = useState('')
  const [noticeKind, setNoticeKind] = useState('error')

  const applyProfile = useCallback(async () => {
    const next = await profileFromSession()
    setUser(next.user)
    setNotice(next.notice)
    setNoticeKind(next.noticeKind)
    return next
  }, [])

  useEffect(() => {
    let active = true
    authService.ensureClient()
      .then(() => applyProfile())
      .catch((err) => {
        if (!active) return
        setUser(null)
        setNotice(err.message)
        setNoticeKind('error')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => { active = false }
  }, [applyProfile])

  useEffect(() => {
    const onDenied = () => {
      setUser(null)
      authService.signOut().catch((err) => {
        setNotice(err.message)
        setNoticeKind('error')
      })
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onDenied)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onDenied)
  }, [])

  const login = useCallback(async (credentials) => {
    setNotice('')
    await authService.signInWithPassword(credentials)
    const next = await applyProfile()
    if (next.user) return next.user
    if (next.noticeKind === 'ok') return null
    throw new Error(next.notice || 'No hay un perfil para este correo. Pedile a un administrador que te habilite.')
  }, [applyProfile])

  const loginWithGoogle = useCallback(async () => {
    setNotice('')
    setNoticeKind('error')
    await authService.signInWithGoogle()
  }, [])

  const logout = useCallback(async () => {
    await authService.signOut()
    setUser(null)
    setNotice('')
    setNoticeKind('error')
  }, [])

  const value = useMemo(
    () => ({ user, loading, notice, noticeKind, login, loginWithGoogle, logout, applyProfile }),
    [user, loading, notice, noticeKind, login, loginWithGoogle, logout, applyProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
