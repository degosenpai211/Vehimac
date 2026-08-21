import { useEffect, useRef, useState } from 'react'
import { api, formatPhone } from '../services/api'

export default function ClientSearch({ value, onChange, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedName, setSelectedName] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (value && !selectedName) {
      api.getClient(value).then((c) => {
        setSelectedName(c.name)
        setQuery(c.name)
        onSelect?.(c)
      }).catch(() => {})
    }
  }, [value])

  useEffect(() => {
    if (!query.trim() || (selectedName && query === selectedName)) {
      setResults([])
      return
    }
    const t = setTimeout(() => {
      setLoading(true)
      api.getClients({ search: query.trim(), prefix: true, limit: 10 })
        .then((res) => setResults(res.items || res))
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, 250)
    return () => clearTimeout(t)
  }, [query, selectedName])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const pick = (client) => {
    setSelectedName(client.name)
    setQuery(client.name)
    setOpen(false)
    onChange(client.id)
    onSelect?.(client)
  }

  const clear = () => {
    setQuery('')
    setSelectedName('')
    onChange('')
    onSelect?.(null)
  }

  return (
    <div ref={ref} className="relative">
      <label className="label">Cliente</label>
      <input
        className="input"
        placeholder="Escribí el nombre... ej: Die, Arman"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value)
          setSelectedName('')
          onChange('')
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {value && (
        <button type="button" onClick={clear} className="text-xs text-slate-500 mt-1 hover:text-red-600">
          Quitar cliente
        </button>
      )}
      {open && query.trim() && query !== selectedName && (
        <ul className="absolute z-20 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {loading && <li className="p-3 text-sm text-slate-400">Buscando...</li>}
          {!loading && results.length === 0 && (
            <li className="p-3 text-sm text-slate-400">Sin resultados</li>
          )}
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-brand-50 text-sm"
                onClick={() => pick(c)}
              >
                <span className="font-medium">{c.name}</span>
                {c.phone && <span className="text-slate-400 ml-2">{formatPhone(c.phone)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
