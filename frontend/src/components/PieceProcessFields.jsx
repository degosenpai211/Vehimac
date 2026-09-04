import { useState } from 'react'
import { Check, ChevronDown, ChevronRight } from 'lucide-react'
import MechanicSearch from './MechanicSearch'
import {
  PROCESS_STEPS,
  STEP_STATUS_META,
  normalizeProcess,
  cycleStepStatus,
  allStepsCompleted,
  formatProcessDate,
} from '../utils/process'

function StepCircle({ index, status, onCycle, readOnly }) {
  const n = index + 1
  const done = status === 'completado'
  const active = status === 'en_proceso'
  const cls = done
    ? 'bg-brand-600 text-white border-brand-600'
    : active
      ? 'bg-white text-brand-700 border-brand-600'
      : 'bg-white text-slate-400 border-slate-300'

  return (
    <button
      type="button"
      disabled={readOnly}
      title={readOnly ? STEP_STATUS_META[status].label : 'Cambiar estado'}
      onClick={() => onCycle?.()}
      className="shrink-0 w-11 h-11 inline-flex items-center justify-center rounded-full"
    >
      <span className={`w-7 h-7 rounded-full border-2 inline-flex items-center justify-center text-xs font-bold ${cls}`}>
        {done ? <Check size={14} strokeWidth={3} /> : n}
      </span>
    </button>
  )
}

function StatusBadge({ status, onCycle, readOnly }) {
  const meta = STEP_STATUS_META[status] || STEP_STATUS_META.pendiente
  return (
    <button
      type="button"
      disabled={readOnly}
      onClick={() => onCycle?.()}
      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${meta.badge} ${readOnly ? '' : 'hover:opacity-80'}`}
    >
      {meta.label}
    </button>
  )
}

export default function PieceProcessFields({ process, onChange = () => {}, readOnly = false, embedded = false }) {
  const p = normalizeProcess(process)
  const [open, setOpen] = useState(false)
  const allDone = allStepsCompleted(p)
  const confirmed = !!p.confirmed

  const patch = (partial) => {
    if (readOnly) return
    const next = { ...normalizeProcess(process), ...partial }
    if (partial.steps) {
      next.confirmed = !!next.confirmed && next.steps.every((s) => s.status === 'completado')
    }
    onChange(next)
  }

  const updateStep = (id, field, value) => {
    patch({
      steps: p.steps.map((s) => (s.id === id ? { ...s, [field]: value } : s)),
    })
  }

  const cycle = (id) => {
    const steps = p.steps.map((s) => (s.id === id ? { ...s, status: cycleStepStatus(s.status) } : s))
    patch({ steps })
  }

  const toggleConfirm = () => {
    if (readOnly) return
    if (!confirmed && !allDone) return
    onChange({ ...p, confirmed: !confirmed })
  }

  return (
    <div className={embedded ? 'overflow-visible' : 'rounded-lg border border-slate-200 bg-white overflow-visible'}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex-1 flex items-center gap-2 px-3 py-2 text-left min-h-[44px] hover:bg-slate-50 rounded-lg"
        >
          {open ? <ChevronDown size={16} className="text-slate-500 shrink-0" /> : <ChevronRight size={16} className="text-slate-500 shrink-0" />}
          <span className="text-sm font-semibold text-slate-700">Proceso</span>
          <span className="text-[11px] text-slate-400">
            {p.steps.filter((s) => s.status === 'completado').length}/5
          </span>
        </button>
        {(!readOnly || confirmed) && (
        <button
          type="button"
          disabled={readOnly || (!confirmed && !allDone)}
          title={
            confirmed
              ? 'Proceso cumplido'
              : allDone
                ? 'Confirmar que se cumplió todo el proceso'
                : 'Completá los 5 pasos para confirmar'
          }
          onClick={toggleConfirm}
          className={`mr-2 w-11 h-11 inline-flex items-center justify-center rounded-full shrink-0 ${
            confirmed
              ? 'text-brand-700'
              : allDone
                ? 'text-brand-600 hover:bg-brand-50'
                : 'text-slate-300'
          }`}
        >
          <span className={`w-7 h-7 rounded-full border-2 inline-flex items-center justify-center ${
            confirmed ? 'bg-brand-600 border-brand-600 text-white' : 'border-current'
          }`}>
            <Check size={14} strokeWidth={3} />
          </span>
        </button>
        )}
      </div>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-slate-100">
          <ol>
            {PROCESS_STEPS.map((meta, i) => {
              const step = p.steps.find((s) => s.id === meta.id) || { id: meta.id, status: 'pendiente', assigned_at: '', technician: '' }
              const pendingLook = step.status === 'pendiente'
              const lineOn = step.status === 'completado'
              return (
                <li key={meta.id} className="flex gap-1">
                  <div className="flex flex-col items-center">
                    <StepCircle
                      index={i}
                      status={step.status}
                      readOnly={readOnly}
                      onCycle={() => cycle(meta.id)}
                    />
                    {i < PROCESS_STEPS.length - 1 && (
                      <div className={`w-0.5 flex-1 min-h-[12px] ${lineOn ? 'bg-brand-600' : 'bg-slate-200'}`} />
                    )}
                  </div>
                  <div className={`flex-1 pb-4 min-w-0 ${i === PROCESS_STEPS.length - 1 ? 'pb-1' : ''}`}>
                    <div className="flex items-center justify-between gap-2 pt-2 mb-2">
                      <p className={`font-semibold text-sm ${pendingLook ? 'text-slate-400' : 'text-slate-800'}`}>
                        {meta.label}
                      </p>
                      <StatusBadge status={step.status} readOnly={readOnly} onCycle={() => cycle(meta.id)} />
                    </div>
                    {readOnly ? (
                      <p className="text-sm text-slate-600">
                        {step.technician || 'Sin asignar'}
                        {step.assigned_at ? ` · ${formatProcessDate(step.assigned_at)}` : ''}
                      </p>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-2">
                        <MechanicSearch
                          value={step.technician || ''}
                          onChange={(val) => updateStep(meta.id, 'technician', val)}
                          placeholder="Asignar técnico"
                        />
                        <input
                          type="datetime-local"
                          className="input text-sm"
                          value={step.assigned_at || ''}
                          onChange={(e) => updateStep(meta.id, 'assigned_at', e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>

          <div className="pt-2 mt-1 border-t border-slate-100 space-y-2">
            <div>
              <label className="label">Entrega OT</label>
              {readOnly ? (
                <p className="text-sm text-slate-600">{p.delivered_at ? formatProcessDate(p.delivered_at) : '—'}</p>
              ) : (
                <input
                  type="datetime-local"
                  className="input text-sm"
                  value={p.delivered_at || ''}
                  onChange={(e) => patch({ delivered_at: e.target.value })}
                />
              )}
            </div>
            <div>
              <label className="label">Observación</label>
              {readOnly ? (
                <p className="text-sm text-slate-600">{p.observation || '—'}</p>
              ) : (
                <input
                  className="input"
                  maxLength={80}
                  placeholder="Observación"
                  value={p.observation || ''}
                  onChange={(e) => patch({ observation: e.target.value.slice(0, 80) })}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
