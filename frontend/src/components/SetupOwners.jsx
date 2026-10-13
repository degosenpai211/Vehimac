import { useState } from 'react'
import AuthShell from '../login/AuthShell'
import FormAlert from '../login/FormAlert'
import PasswordField from '../login/PasswordField'
import SubmitButton from '../login/SubmitButton'
import TextField from '../login/TextField'
import { MailIcon, UserIcon } from '../login/icons'
import { authService } from '../auth/authService'
import { api } from '../services/api'

const EMPTY_PERSON = { name: '', email: '', password: '' }
const MISSING_ANON_KEY_MESSAGE =
  'Falta pegar VITE_SUPABASE_ANON_KEY en frontend/.env (Project Settings → API → anon public). Después reiniciá npm run dev.'

function PersonFields({ idPrefix, title, hint, person, onChange }) {
  const updateField = (event) => {
    const { name, value } = event.target
    onChange({ ...person, [name]: value })
  }

  return (
    <fieldset className="login-fieldset">
      <legend>{title}</legend>
      <p className="login-fieldset__hint">{hint}</p>
      <TextField
        id={`${idPrefix}-name`}
        name="name"
        type="text"
        label="Nombre"
        placeholder="Nombre y apellido"
        autoComplete="name"
        icon={<UserIcon />}
        value={person.name}
        onChange={updateField}
        required
      />
      <TextField
        id={`${idPrefix}-email`}
        name="email"
        type="email"
        label="Correo electrónico"
        placeholder="nombre@correo.com"
        autoComplete="off"
        icon={<MailIcon />}
        value={person.email}
        onChange={updateField}
        required
      />
      <PasswordField
        id={`${idPrefix}-password`}
        name="password"
        label="Contraseña"
        placeholder="Mínimo 8 caracteres"
        autoComplete="new-password"
        minLength={authService.minPasswordLength}
        value={person.password}
        onChange={updateField}
        required
      />
    </fieldset>
  )
}

export default function SetupOwners({ onReady }) {
  const [owner, setOwner] = useState(EMPTY_PERSON)
  const [developer, setDeveloper] = useState(EMPTY_PERSON)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const frontReady = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)

  const onSubmit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError('')
    try {
      await api.bootstrapOwners({ owner, developer })
      await onReady(owner)
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <AuthShell>
      <form className="login-form login-form--wide" onSubmit={onSubmit} noValidate>
        <header className="login-form__header">
          <h1 className="login-form__title">Dueño y programador</h1>
          <p className="login-form__subtitle">
            Los dos entran como administradores, al mismo tiempo. Después se invita al resto.
          </p>
        </header>

        {!frontReady && <FormAlert message={MISSING_ANON_KEY_MESSAGE} variant="warn" />}
        {error && <FormAlert message={error} />}

        <div className="login-form__grid">
          <PersonFields
            idPrefix="owner"
            title="Dueño"
            hint="Quien lleva el taller."
            person={owner}
            onChange={setOwner}
          />
          <PersonFields
            idPrefix="developer"
            title="Programador"
            hint="Quien ve y toca el sistema."
            person={developer}
            onChange={setDeveloper}
          />
        </div>

        <SubmitButton
          isLoading={saving}
          disabled={!frontReady}
          idleLabel="Crear los dos administradores"
          loadingLabel="Creando cuentas…"
        />
      </form>
    </AuthShell>
  )
}
