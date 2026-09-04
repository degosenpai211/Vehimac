export const PROCESS_STEPS = [
  { id: 'diseno', label: 'Diseño' },
  { id: 'soldadura', label: 'Soldadura' },
  { id: 'afinado', label: 'Afinado' },
  { id: 'pintura', label: 'Pintura' },
  { id: 'instalacion', label: 'Instalación' },
]

export const STEP_STATUSES = ['pendiente', 'en_proceso', 'completado']

export const STEP_STATUS_META = {
  pendiente: { label: 'Pendiente', badge: 'bg-slate-100 text-slate-500' },
  en_proceso: { label: 'En proceso', badge: 'bg-brand-50 text-brand-700' },
  completado: { label: 'Completado', badge: 'bg-emerald-50 text-emerald-700' },
}

function inferStatus(step) {
  const raw = step?.status
  if (STEP_STATUSES.includes(raw)) return raw
  if (step?.technician || step?.assigned_at) return 'en_proceso'
  return 'pendiente'
}

export function emptyStep(id) {
  return { id, assigned_at: '', technician: '', status: 'pendiente' }
}

export function emptyProcess() {
  return {
    steps: PROCESS_STEPS.map((s) => emptyStep(s.id)),
    delivered_at: '',
    observation: '',
    confirmed: false,
  }
}

export function normalizeProcess(raw) {
  const base = emptyProcess()
  if (!raw || typeof raw !== 'object') return base
  const byId = {}
  for (const step of raw.steps || []) {
    if (step?.id) byId[step.id] = step
  }
  const steps = PROCESS_STEPS.map((s) => {
    const found = byId[s.id] || {}
    return {
      id: s.id,
      assigned_at: toDatetimeLocal(found.assigned_at),
      technician: found.technician || '',
      status: inferStatus(found),
    }
  })
  const confirmed = !!raw.confirmed && steps.every((s) => s.status === 'completado')
  return {
    steps,
    delivered_at: toDatetimeLocal(raw.delivered_at),
    observation: String(raw.observation || '').slice(0, 80),
    confirmed,
  }
}

export function toDatetimeLocal(value) {
  if (!value) return ''
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(str) && !str.includes('Z') && !str.includes('+')) {
    return str.slice(0, 16)
  }
  const d = new Date(str)
  if (Number.isNaN(d.getTime())) return str.slice(0, 16)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function serializeProcess(process) {
  const p = normalizeProcess(process)
  return {
    steps: p.steps.map((s) => ({
      id: s.id,
      assigned_at: s.assigned_at || null,
      technician: s.technician.trim() || null,
      status: s.status,
    })),
    delivered_at: p.delivered_at || null,
    observation: p.observation.trim() || null,
    confirmed: !!p.confirmed,
  }
}

export function cycleStepStatus(status) {
  const i = STEP_STATUSES.indexOf(status)
  return STEP_STATUSES[(i + 1) % STEP_STATUSES.length]
}

export function allStepsCompleted(process) {
  return normalizeProcess(process).steps.every((s) => s.status === 'completado')
}

export function formatProcessDate(value) {
  const local = toDatetimeLocal(value)
  if (!local) return '—'
  const [d, t] = local.split('T')
  if (!d || !t) return local
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y} ${t}`
}

export function orderProcessDone(order) {
  const pieces = order?.pieces || []
  if (!pieces.length) return false
  return pieces.every((p) => normalizeProcess(p.process).confirmed)
}
