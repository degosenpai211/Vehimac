import { useEffect, useRef, useState } from 'react'
import { api } from '../services/api'

function peopleOf(payload) {
  if (Array.isArray(payload)) return payload
  return payload?.people || []
}

function plainName(value) {
  return String(value || '').split('—')[0].split('-')[0].trim()
}

function matchPerson(people, name) {
  const key = plainName(name).toLowerCase()
  if (!key) return null
  return people.find((row) => plainName(row.name).toLowerCase() === key) || null
}

function lateNotice(name, late) {
  if (!late) return ''
  const label = late === 1 ? 'orden atrasada' : 'órdenes atrasadas'
  return `${name} tiene ${late} ${label}. Se asigna igual.`
}

function uniqueByName(rows) {
  const seen = new Set()
  const unique = []
  for (const row of rows) {
    const key = plainName(row.name).toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  return unique
}

export default function MechanicSearch({ value, onChange, placeholder = 'Mecánico', role, uniqueNames = false, flow = false }) {
  const [query, setQuery] = useState(value || '')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')
  const ref = useRef(null)
  const edited = useRef(false)

  useEffect(() => {
    setQuery(value || '')
  }, [value])

  useEffect(() => {
    if (!open) return undefined
    const q = query.trim()
    const t = setTimeout(() => {
      setLoading(true)
      const params = { active_only: true, limit: uniqueNames ? 80 : (q ? 10 : 30), prefix: true }
      if (q) params.search = q
      if (role) params.role = role
      api.getMechanics(params)
        .then((res) => {
          const rows = (res || []).filter((m) => m.role !== 'admin')
          setResults(uniqueNames ? uniqueByName(rows) : rows)
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false))
    }, q ? 200 : 0)
    return () => clearTimeout(t)
  }, [query, role, open, uniqueNames])

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const name = plainName(query)
    if (!edited.current || !name) {
      setNotice('')
      return undefined
    }
    let cancelled = false
    const timer = setTimeout(() => {
      api.getMechanicWorkload()
        .then((payload) => {
          if (cancelled) return
          const row = matchPerson(peopleOf(payload), name)
          setNotice(lateNotice(name, row?.overdue || 0))
        })
        .catch(() => {
          if (!cancelled) setNotice('')
        })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query])

  return (
    <div ref={ref} className="relative">
      <input
        className="input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => {
          const val = e.target.value
          edited.current = true
          setQuery(val)
          onChange(val)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {notice && <p className="text-xs text-amber-700 mt-1">{notice}</p>}
      {open && (
        <ul className={flow
          ? 'mt-1 bg-white border border-slate-200 rounded-lg shadow-sm max-h-48 overflow-y-auto'
          : 'absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg max-h-48 overflow-y-auto'}>
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
                  const label = uniqueNames || role
                    ? plainName(m.name)
                    : (!role && m.role
                      ? `${m.name} — ${m.role === 'designer' ? 'Diseñador' : 'Mecánico'}`
                      : m.name)
                  edited.current = true
                  setQuery(label)
                  onChange(label)
                  setOpen(false)
                }}
              >
                {plainName(m.name)}
                {!uniqueNames && !role && m.role && (
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
