import { AlertIcon } from './icons'

export default function FormAlert({ message, variant = 'error' }) {
  return (
    <div className={`form-alert form-alert--${variant}`} role="alert">
      <AlertIcon />
      <p>{message}</p>
    </div>
  )
}
