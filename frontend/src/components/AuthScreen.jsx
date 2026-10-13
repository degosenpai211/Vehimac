import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import VehimacLogo from './VehimacLogo'

export function AuthPasswordField({ id, label, value, onChange, autoComplete, minLength }) {
  const [visible, setVisible] = useState(false)
  return (
    <div>
      <label className="label" htmlFor={id}>{label}</label>
      <div className="relative">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="input pr-12"
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          minLength={minLength}
          required
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-slate-500 hover:text-slate-800 min-h-[44px] min-w-[44px]"
          onClick={() => setVisible((open) => !open)}
          aria-label={visible ? 'Ocultar clave' : 'Mostrar clave'}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </div>
  )
}

export function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.28-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96L3.97 7.3C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}

export default function AuthScreen({ copy, children }) {
  return (
    <div className="min-h-screen min-h-[100dvh] grid lg:grid-cols-2 bg-slate-950">
      <section className="relative hidden lg:flex flex-col justify-between p-10 text-white overflow-hidden login-hero">
        <div className="relative z-10">
          <div className="inline-flex items-center gap-3 rounded-2xl bg-white/10 backdrop-blur px-3 py-2 border border-white/15">
            <div className="rounded-xl bg-white p-1 shadow-sm">
              <VehimacLogo size={48} />
            </div>
            <div>
              <p className="text-sm font-semibold tracking-wide">VEHIMAC</p>
              <p className="text-xs text-blue-100/80">ERP del taller</p>
            </div>
          </div>
        </div>
        <div className="relative z-10 max-w-md space-y-4">
          <p className="text-xs uppercase tracking-[0.2em] text-blue-200/80">Santa Cruz</p>
          <h1 className="text-4xl font-semibold leading-tight">
            Soluciones con impresiones 3D
          </h1>
          <p className="text-blue-100/85 text-base">
            Órdenes, proformas y el día a día del taller, en un solo lugar.
          </p>
        </div>
        <p className="relative z-10 text-xs text-blue-100/60">Plastic 27 · Teléfonos 71015081 / 60830350</p>
      </section>

      <section className="flex items-center justify-center p-4 sm:p-8 bg-slate-50">
        <div className={`w-full ${copy.wide ? "max-w-2xl" : "max-w-md"}`}>
          <div className="lg:hidden flex flex-col items-center text-center mb-6">
            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-3">
              <VehimacLogo size={64} />
            </div>
            <h1 className="mt-3 text-xl font-bold text-slate-900">Vehimac ERP</h1>
          </div>
          <div className="rounded-2xl bg-white shadow-xl shadow-slate-900/5 border border-slate-200/80 p-6 sm:p-8 space-y-6">
            <div>
              <h2 className="text-lg lg:text-2xl font-semibold text-slate-900">{copy.title}</h2>
              <p className="text-sm text-slate-500 mt-1">{copy.subtitle}</p>
            </div>
            {children}
          </div>
        </div>
      </section>
    </div>
  )
}
