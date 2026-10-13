import { GoogleIcon } from './icons'

export default function GoogleButton({ onClick, disabled = false }) {
  return (
    <button type="button" className="button button--outline" onClick={onClick} disabled={disabled}>
      <GoogleIcon />
      Continuar con Google
    </button>
  )
}
