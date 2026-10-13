import { useEffect, useState } from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import LoginPage from '../login/LoginPage'
import SetupOwners from '../components/SetupOwners'
import { useAuth } from '../auth/AuthContext'
import { api } from '../services/api'

function loginAlert(message) {
  const text = String(message || '')
  if (text.includes('No se pudo leer perfiles') || text.includes('migration_v19')) return ''
  return text
}

export default function Login() {
  const { user, loading, login, loginWithGoogle, notice, noticeKind } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [saving, setSaving] = useState(false)
  const [checkingSetup, setCheckingSetup] = useState(true)
  const [needsBootstrap, setNeedsBootstrap] = useState(false)
  const from = location.state?.from?.pathname || '/'

  useEffect(() => {
    let active = true
    api.authStatus()
      .then((status) => {
        if (active) setNeedsBootstrap(Boolean(status.needs_bootstrap))
      })
      .catch((err) => {
        if (!active) return
        const alert = loginAlert(err.message)
        if (alert) setError(alert)
      })
      .finally(() => {
        if (active) setCheckingSetup(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!notice) return
    if (noticeKind === 'ok') {
      setInfo(notice)
      setError('')
      return
    }
    setError(loginAlert(notice))
    setInfo('')
  }, [notice, noticeKind])

  if (loading || checkingSetup) return null
  if (user) return <Navigate to={from} replace />

  const handleSubmit = async (credentials) => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await login(credentials)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleGoogle = async () => {
    setSaving(true)
    setError('')
    setInfo('')
    try {
      await loginWithGoogle()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  if (needsBootstrap) {
    return (
      <SetupOwners
        onReady={async (owner) => {
          await login({ email: owner.email, password: owner.password })
        }}
      />
    )
  }

  return (
    <LoginPage
      errorMessage={loginAlert(error)}
      infoMessage={info}
      isSubmitting={saving}
      onSubmit={handleSubmit}
      onForgotPassword={() => navigate('/recuperar-clave')}
      onGoogleSignIn={handleGoogle}
    />
  )
}
