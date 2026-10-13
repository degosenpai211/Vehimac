import { useState } from 'react'
import TextField from './TextField'
import PasswordField from './PasswordField'
import FormAlert from './FormAlert'
import GoogleButton from './GoogleButton'
import SubmitButton from './SubmitButton'
import { MailIcon } from './icons'

const EMPTY_CREDENTIALS = { email: '', password: '' }

export default function LoginForm({
  errorMessage,
  infoMessage,
  isSubmitting = false,
  onSubmit,
  onForgotPassword,
  onGoogleSignIn,
}) {
  const [credentials, setCredentials] = useState(EMPTY_CREDENTIALS)

  const updateField = (event) => {
    const { name, value } = event.target
    setCredentials((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = (event) => {
    event.preventDefault()
    onSubmit?.(credentials)
  }

  const forgotPasswordLink = (
    <button type="button" className="text-link" onClick={onForgotPassword}>
      ¿Olvidaste tu contraseña?
    </button>
  )

  return (
    <form className="login-form" onSubmit={handleSubmit} noValidate>
      <header className="login-form__header">
        <h1 className="login-form__title">Iniciar sesión</h1>
        <p className="login-form__subtitle">
          Entra con el correo que te registró el administrador del taller.
        </p>
      </header>

      {infoMessage && <FormAlert message={infoMessage} variant="ok" />}
      {errorMessage && <FormAlert message={errorMessage} />}

      <TextField
        id="email"
        name="email"
        type="email"
        label="Correo electrónico"
        placeholder="nombre@correo.com"
        autoComplete="email"
        icon={<MailIcon />}
        value={credentials.email}
        onChange={updateField}
        aria-invalid={Boolean(errorMessage)}
      />

      <PasswordField
        id="password"
        name="password"
        label="Contraseña"
        placeholder="Tu contraseña"
        autoComplete="current-password"
        labelAction={forgotPasswordLink}
        value={credentials.password}
        onChange={updateField}
        aria-invalid={Boolean(errorMessage)}
      />

      <SubmitButton isLoading={isSubmitting} idleLabel="Entrar" loadingLabel="Entrando…" />

      <div className="login-form__divider"><span>o</span></div>

      <GoogleButton onClick={onGoogleSignIn} disabled={isSubmitting} />

      <p className="login-form__footnote">
        ¿Aún no tienes acceso? Entrá con Google y un administrador te da rol y clave.
      </p>
    </form>
  )
}
