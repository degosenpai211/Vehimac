import { useState } from 'react'
import TextField from './TextField'
import { EyeIcon, EyeOffIcon, LockIcon } from './icons'

export default function PasswordField(props) {
  const [isVisible, setIsVisible] = useState(false)

  const visibilityToggle = (
    <button
      type="button"
      className="field__toggle"
      onClick={() => setIsVisible((current) => !current)}
      aria-label={isVisible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      aria-pressed={isVisible}
    >
      {isVisible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )

  return (
    <TextField
      {...props}
      type={isVisible ? 'text' : 'password'}
      icon={<LockIcon />}
      trailing={visibilityToggle}
    />
  )
}
