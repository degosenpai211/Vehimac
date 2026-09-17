import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import VehimacLogo from '../components/VehimacLogo'
import { api } from '../services/api'

export default function ProformaPublicLink() {
  const { code } = useParams()
  const [error, setError] = useState('')

  useEffect(() => {
    if (!code) {
      setError('No encontramos esa proforma.')
      return
    }
    let cancelled = false
    api.getProformaShare(code)
      .then((data) => {
        if (cancelled) return
        if (!data?.url) {
          setError('No se pudo abrir el PDF.')
          return
        }
        window.location.replace(data.url)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err.status === 410
          ? 'Este link venció (vale 30 días).'
          : (err.message || 'No encontramos esa proforma.'))
      })
    return () => { cancelled = true }
  }, [code])

  return (
    <div className="min-h-screen min-h-[100dvh] bg-slate-50 flex items-center justify-center p-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="flex justify-center">
          <VehimacLogo size={72} />
        </div>
        {error ? (
          <>
            <h1 className="text-lg font-semibold text-slate-900">No se pudo abrir</h1>
            <p className="text-sm text-slate-600">{error}</p>
          </>
        ) : (
          <>
            <h1 className="text-lg font-semibold text-slate-900">Abriendo tu proforma</h1>
            <p className="text-sm text-slate-500">Un momento…</p>
          </>
        )}
      </div>
    </div>
  )
}
