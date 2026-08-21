import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export default function MechanicSearch({ value, onChange, placeholder = 'Mecánico' }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    const q = query.trim()
    if (!q) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      api.getMechanics({ search: q, prefix: true, active_only: true, limit: 10 })
        .then((res) => setResults(res || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [query])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={ref} className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const val = e.target.value
          setQuery(val)
          onChange(val)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && query.trim() && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {loading && <li className="p-2 text-xs text-slate-400">Buscando...</li>}
          {!loading && results.length === 0 && (
            <li className="p-2 text-xs text-slate-400">Sin coincidencias — se guarda el texto</li>
          )}
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm"
                onClick={() => {
                  setQuery(m.name)
                  onChange(m.name)
                  setOpen(false)
                }}
              >
                {m.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
