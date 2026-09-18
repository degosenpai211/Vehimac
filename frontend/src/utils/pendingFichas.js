const KEY = 'vehimac.pendingFichas'
const EVENT = 'vehimac:pending-fichas'

export function getPendingFichas() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
    return Array.isArray(raw) ? raw.filter((f) => f?.id) : []
  } catch {
    return []
  }
}

function save(list) {
  localStorage.setItem(KEY, JSON.stringify(list))
  window.dispatchEvent(new Event(EVENT))
}

export function addPendingFicha({ id, name }) {
  if (!id) return
  const list = getPendingFichas().filter((f) => String(f.id) !== String(id))
  list.unshift({ id, name: name || 'este cliente' })
  save(list)
}

export function dismissPendingFicha(id) {
  if (!id) return
  save(getPendingFichas().filter((f) => String(f.id) !== String(id)))
}

export function subscribePendingFichas(onChange) {
  const handler = () => onChange(getPendingFichas())
  window.addEventListener(EVENT, handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener(EVENT, handler)
    window.removeEventListener('storage', handler)
  }
}
