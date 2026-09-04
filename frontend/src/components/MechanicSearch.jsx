import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

export default function MechanicSearch({ value, onChange, placeholder = 'Mecánico', role }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    const t = setTimeout(() => {
      setLoading(true)
      const params = { active_only: true, limit: q ? 10 : 30, prefix: true }
      if (q) params.search = q
      if (role) params.role = role
      api.getMechanics(params)
        .then((res) => setResults(res || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, q ? 200 : 0)
    return () => clearTimeout(t)
  }, [query, role, open])

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
      {open && (
        <ul className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
          {loading && <li className="p-2 text-xs text-slate-400">Buscando...</li>}
          {!loading && results.length === 0 && (
            <li className="p-2 text-xs text-slate-400">{query.trim() ? 'Sin coincidencias — se guarda el texto' : 'Equipo activo'}</li>
          )}
          {results.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm"
                onClick={() => {
                  const label = !role && m.role
                    ? `${m.name} — ${m.role === 'designer' ? 'Diseñador' : 'Mecánico'}`
                    : m.name
                  setQuery(label)
                  onChange(label)
                  setOpen(false)
                }}
              >
                {m.name}
                {!role && m.role && (
                  <span className="ml-2 text-[10px] uppercase text-slate-400">
                    {m.role === 'designer' ? 'Diseñador' : 'Mecánico'}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
