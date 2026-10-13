import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import AuthShell from '../login/AuthShell'
import FormAlert from '../login/FormAlert'
import PasswordField from '../login/PasswordField'
import SubmitButton from '../login/SubmitButton'
import TextField from '../login/TextField'
import { MailIcon } from '../login/icons'
import { authService } from '../auth/authService'

function RecoverHeader({ title, subtitle }) {
  return (
    <header className="login-form__header">
      <h1 className="login-form__title">{title}</h1>
      <p className="login-form__subtitle">{subtitle}</p>
    </header>
  )
}

export default function RecuperarClave() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [hasSession, setHasSession] = useState(false)
  const [checking, setChecking] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')

  useEffect(() => {
    let active = true
    let stop = () => {}
    authService.getSession()
      .then((session) => {
        if (!active) return
        setHasSession(Boolean(session))
        setChecking(false)
      })
      .catch((err) => {
        if (active) setError(err.message)
      })
    authService.onAuthStateChange((event, session) => {
      if (!active) return
      if (session || event === 'PASSWORD_RECOVERY') setHasSession(true)
      setChecking(false)
    }).then((result) => {
      const sub = result?.data?.subscription
      if (sub) stop = () => sub.unsubscribe()
    }).catch((err) => {
      if (active) {
        setError(err.message)
        setChecking(false)
      }
    })
    return () => {
      active = false
      stop()
    }
  }, [])

  const onRequest = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setDone('')
    try {
      await authService.requestPasswordReset(email)
      setDone('Si ese correo tiene cuenta, te llega un mail para cambiar la clave.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  const onUpdate = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    setDone('')
    try {
      await authService.updatePassword(password)
      setDone('Clave actualizada. Ya podés entrar.')
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  if (checking) return null

  return (
    <AuthShell>
      <form
        className="login-form"
        onSubmit={hasSession ? onUpdate : onRequest}
        noValidate
      >
        <RecoverHeader
          title={hasSession ? 'Nueva clave' : 'Recuperar acceso'}
          subtitle={
            hasSession
              ? 'Elegí una clave nueva para tu cuenta.'
              : 'Te mandamos un correo para cambiar la clave.'
          }
        />

        {error && <FormAlert message={error} />}
        {done && <FormAlert message={done} variant="ok" />}

        {hasSession ? (
          <PasswordField
            id="new-password"
            name="password"
            label="Clave nueva"
            placeholder="Nueva contraseña"
            autoComplete="new-password"
            minLength={authService.minPasswordLength}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        ) : (
          <TextField
            id="recover-email"
            name="email"
            type="email"
            label="Correo electrónico"
            placeholder="nombre@correo.com"
            autoComplete="email"
            icon={<MailIcon />}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        )}

        <SubmitButton
          isLoading={saving}
          idleLabel={hasSession ? 'Guardar clave' : 'Enviar correo'}
          loadingLabel={hasSession ? 'Guardando…' : 'Enviando…'}
        />

        <p className="login-form__footnote">
          <Link to="/login" className="text-link">Volver a entrar</Link>
        </p>
      </form>
    </AuthShell>
  )
}
