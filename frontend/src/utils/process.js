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
  return { id, assigned_at: '', technician: '', status: 'pendiente', completed_at: '' }
}

export function boliviaNow() {
  const now = new Date()
  const utc = now.getTime() + now.getTimezoneOffset() * 60000
  const bolivia = new Date(utc - 4 * 60 * 60000)
  const pad = (n) => String(n).padStart(2, '0')
  return `${bolivia.getFullYear()}-${pad(bolivia.getMonth() + 1)}-${pad(bolivia.getDate())}T${pad(bolivia.getHours())}:${pad(bolivia.getMinutes())}`
}

export const OTHER_PIECE_ID = 'otra'

export function emptyCommission() {
  return {
    piece_id: '',
    mount_count: 0,
    arm_count: 0,
    weld_cm: 0,
    finish_cm: 0,
    mount_technician: '',
    arm_technician: '',
    custom_amount: 0,
    custom_note: '',
    custom_technician: '',
    paint_amount: 0,
    design_size: 0,
  }
}

export function emptyProcess() {
  return {
    steps: PROCESS_STEPS.map((s) => emptyStep(s.id)),
    delivered_at: '',
    observation: '',
    confirmed: false,
    commission: emptyCommission(),
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
      completed_at: toDatetimeLocal(found.completed_at),
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
    commission: { ...emptyCommission(), ...(raw.commission || {}) },
  }
}

export function toDatetimeLocal(value) {
  if (!value) return ''
  const str = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
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
  const body = {
    steps: p.steps.map((s) => ({
      id: s.id,
      assigned_at: s.assigned_at || null,
      completed_at: s.status === 'completado' ? (s.completed_at || null) : null,
      technician: s.technician.trim() || null,
      status: s.status,
    })),
    delivered_at: p.delivered_at || null,
    observation: p.observation.trim() || null,
    confirmed: !!p.confirmed,
  }
  if (p.commission?.piece_id) body.commission = p.commission
  return body
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
  if (!d) return local
  const [y, m, day] = d.split('-')
  if (!y || !m || !day) return local
  if (!t) return `${day}/${m}/${y}`
  return `${day}/${m}/${y} ${t}`
}

export function orderProcessDone(order) {
  if (typeof order?.process_done === 'boolean') return order.process_done
  const pieces = order?.pieces || []
  if (!pieces.length) return false
  return pieces.every((p) => normalizeProcess(p.process).confirmed)
}

export function participationByPerson(process) {
  const byName = new Map()
  for (const step of normalizeProcess(process).steps) {
    const name = String(step.technician || '').split('—')[0].split('-')[0].trim()
    if (!name) continue
    const label = PROCESS_STEPS.find((item) => item.id === step.id)?.label || step.id
    const current = byName.get(name) || []
    current.push(label)
    byName.set(name, current)
  }
  return [...byName.entries()].map(([name, labels]) => ({
    name,
    labels,
    count: labels.length,
  }))
}
