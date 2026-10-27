import { useEffect, useRef, useState } from 'react'
import MechanicSearch from './MechanicSearch'
import { api, formatCurrency } from '../services/api'
import { OTHER_PIECE_ID, emptyCommission } from '../utils/process'

const NOTE_LIMIT = 120
const TASKS = [
  { field: 'mount_count', label: 'Desmontado/montado', unit: 'Bs al cliente', technician: 'mount_technician' },
  { field: 'arm_count', label: 'Desarmado/armado', unit: 'Bs al cliente', technician: 'arm_technician' },
  { field: 'weld_cm', label: 'Soldadura', unit: 'cm', stepId: 'soldadura' },
  { field: 'finish_cm', label: 'Afinado', unit: 'cm', stepId: 'afinado' },
]

let catalogRequest = null

function loadCatalog() {
  if (!catalogRequest) {
    catalogRequest = api.getCommissionPieces().catch((error) => {
      catalogRequest = null
      throw error
    })
  }
  return catalogRequest
}

function readQuantity(text) {
  const number = Number(String(text).replace(',', '.'))
  if (!Number.isFinite(number) || number < 0) return 0
  return Math.round(number * 100) / 100
}

function formatWholeBolivianos(amount) {
  const rounded = Math.round(Number(amount) || 0)
  return new Intl.NumberFormat('es-BO', {
    style: 'currency',
    currency: 'BOB',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rounded)
}

function NumberField({ field }) {
  const { value, max, onCommit } = field
  const [text, setText] = useState(value ? String(value) : '')
  const focused = useRef(false)

  useEffect(() => {
    if (focused.current) return
    setText(value ? String(value) : '')
  }, [value])

  const commit = (raw) => {
    const next = readQuantity(raw)
    const limited = max == null ? next : Math.min(next, max)
    onCommit(limited)
    setText(limited ? String(limited) : '')
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      className="input text-sm"
      value={text}
      onFocus={() => { focused.current = true }}
      onBlur={() => {
        focused.current = false
        commit(text)
      }}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter') return
        event.preventDefault()
        commit(text)
      }}
    />
  )
}

function stepTechnician(process, stepId) {
  const step = (process.steps || []).find((item) => item.id === stepId)
  const name = String(step?.technician || '').trim()
  return name || 'Sin asignar'
}

function pieceName(catalog, pieceId) {
  if (pieceId === OTHER_PIECE_ID) return 'Otra'
  return catalog.find((piece) => piece.id === pieceId)?.name || ''
}

function useCatalog() {
  const [catalog, setCatalog] = useState([])
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    loadCatalog()
      .then((rows) => {
        if (!cancelled) setCatalog(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
    return () => { cancelled = true }
  }, [])
  return { catalog, failed }
}

function choosePiece(pieceId) {
  const next = emptyCommission()
  next.piece_id = pieceId
  return next
}

function QuantityRow({ record }) {
  const { task, process, commission, readOnly, onPatch, hidePerson } = record
  const value = commission[task.field] || 0
  return (
    <div className="space-y-1">
      <label className="label">{task.label} ({task.unit})</label>
      {readOnly ? (
        <p className="text-sm text-slate-700">{value}</p>
      ) : (
        <NumberField field={{ value, onCommit: (amount) => onPatch({ [task.field]: amount }) }} />
      )}
      {!hidePerson && task.stepId && (
        <p className="text-xs text-slate-500">Lo cobra {stepTechnician(process, task.stepId)}, con su efectividad.</p>
      )}
      {!hidePerson && !task.stepId && (
        readOnly ? (
          <p className="text-xs text-slate-500">{commission[task.technician] || 'Sin asignar'}</p>
        ) : (
          <MechanicSearch
            value={commission[task.technician] || ''}
            onChange={(name) => onPatch({ [task.technician]: name })}
            placeholder="Quién lo hizo"
          />
        )
      )}
    </div>
  )
}

function quoteSignature(commission, steps, settings) {
  return JSON.stringify({
    piece_id: commission.piece_id,
    mount_count: commission.mount_count,
    arm_count: commission.arm_count,
    weld_cm: commission.weld_cm,
    finish_cm: commission.finish_cm,
    paint_amount: commission.paint_amount,
    design_size: commission.design_size,
    mount_technician: commission.mount_technician,
    arm_technician: commission.arm_technician,
    custom_amount: commission.custom_amount,
    admin_help: commission.admin_help === true,
    quote_multiplier: commission.quote_multiplier,
    steps: (steps || []).map((step) => ({ id: step.id, technician: step.technician })),
    settings,
  })
}

function timeLabel(figures) {
  const minutes = Number(figures?.time?.minutes) || 0
  if (minutes <= 0) return ''
  const hours = Number(figures.time?.hours) || minutes / 60
  const hourText = hours.toLocaleString('es-BO', { maximumFractionDigits: 1 })
  return `${Math.round(minutes)} min · ${hourText} h`
}

function MoneyPreview({ commission, steps, settings, active, prominent = false }) {
  const [figures, setFigures] = useState(null)
  const signature = quoteSignature(commission, steps, settings)
  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const timer = setTimeout(() => {
      api.previewCommission({ commission, steps, settings })
        .then((body) => { if (!cancelled) setFigures(body) })
        .catch(() => { if (!cancelled) setFigures(null) })
    }, 400)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [active, signature])
  if (!figures?.pay) return null
  if (!prominent) {
    return (
      <p className="text-sm text-slate-700">
        Mano de Obra {formatCurrency(figures.pay.total)} · Cotización {formatWholeBolivianos(figures.quote?.total || 0)}
        {figures.quote?.admin_help ? ` · Precio de la pieza ${formatWholeBolivianos(figures.quote.piece_total)} → ${formatWholeBolivianos(figures.quote.total)}` : ''}
      </p>
    )
  }
  return (
    <div className="grid grid-cols-2 gap-2 rounded-2xl bg-slate-900 p-4 text-white">
      <div>
        <p className="text-xs text-slate-300">Cotización</p>
        <p className="text-2xl font-bold tabular-nums">{formatWholeBolivianos(figures.quote?.total || 0)}</p>
      </div>
      <div>
        <p className="text-xs text-slate-300">Mano de Obra</p>
        <p className="text-2xl font-bold tabular-nums">{formatWholeBolivianos(figures.pay.total)}</p>
      </div>
      {timeLabel(figures) && (
        <p className="col-span-2 text-sm text-slate-200">Tiempo total {timeLabel(figures)}</p>
      )}
      {figures.quote?.admin_help && (
        <p className="col-span-2 text-xs text-amber-200">
          Precio de la pieza {formatWholeBolivianos(figures.quote.piece_total)} → {formatWholeBolivianos(figures.quote.total)}
        </p>
      )}
    </div>
  )
}

function FactorBox({ commission, onApply }) {
  const [text, setText] = useState(String(commission.quote_multiplier || 1))
  const apply = () => {
    const amount = readQuantity(text)
    onApply(amount > 0 ? amount : 1)
  }
  return (
    <div className="flex items-end gap-2">
      <div className="flex-1">
        <label className="label">Multiplicador</label>
        <input
          type="text"
          inputMode="decimal"
          className="input text-sm"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            apply()
          }}
        />
        <p className="mt-1 text-xs text-slate-500">1 no cambia. 1,25 sube 25%.</p>
      </div>
      <button type="button" className="btn-primary btn-sm" onClick={apply}>
        Multiplicar
      </button>
    </div>
  )
}

export default function CommissionRecord({ process, readOnly = false, onChange, standalone = false, settings = null }) {
  const { catalog, failed } = useCatalog()
  const commission = process.commission || emptyCommission()
  const patch = (partial) => onChange({ ...commission, ...partial })
  const isOther = commission.piece_id === OTHER_PIECE_ID
  const isCatalog = Boolean(commission.piece_id) && !isOther

  return (
    <div className="pt-2 mt-1 border-t border-slate-100 space-y-2">
      <div>
        <label className="label">{standalone ? 'Pieza' : 'Comisión de la hoja'}</label>
        <p className="text-xs text-slate-500 mb-1">
          {standalone ? 'Elegí la pieza y las medidas. El precio sale abajo.' : 'Todavía no entra al sueldo.'}
        </p>
        {readOnly ? (
          <p className="text-sm text-slate-700">{pieceName(catalog, commission.piece_id) || 'Sin anotar'}</p>
        ) : (
          <select
            className="input text-sm"
            value={commission.piece_id}
            onChange={(event) => onChange(choosePiece(event.target.value))}
          >
            <option value="">Sin anotar</option>
            {catalog.map((piece) => (
              <option key={piece.id} value={piece.id}>{piece.name}</option>
            ))}
            <option value={OTHER_PIECE_ID}>Otra, monto libre</option>
          </select>
        )}
        {failed && <p className="text-xs text-red-600 mt-1">No se pudo cargar la lista de piezas.</p>}
      </div>
      {isCatalog && TASKS.map((task) => (
        <QuantityRow
          key={task.field}
          record={{ task, process, commission, readOnly, onPatch: patch, hidePerson: standalone }}
        />
      ))}
      {isCatalog && (
        <div className="grid sm:grid-cols-2 gap-2">
          <div>
            <label className="label">Pintura (Bs al cliente)</label>
            {readOnly ? <p className="text-sm text-slate-700">{commission.paint_amount || 0}</p> : (
              <NumberField field={{ value: commission.paint_amount || 0, onCommit: (amount) => patch({ paint_amount: amount }) }} />
            )}
          </div>
          <div>
            <label className="label">Diseño (0 a 3)</label>
            {readOnly ? <p className="text-sm text-slate-700">{commission.design_size || 0}</p> : (
              <NumberField field={{ value: commission.design_size || 0, max: 3, onCommit: (amount) => patch({ design_size: amount }) }} />
            )}
            <p className="text-xs text-slate-500">1 pequeño, 2 mediano, 3 grande. No se le paga al técnico.</p>
          </div>
        </div>
      )}
      {(isCatalog || isOther) && (
        <div className="space-y-2">
          <MoneyPreview commission={commission} steps={process.steps} settings={settings} active prominent={standalone} />
          {!readOnly && standalone && (
            <FactorBox commission={commission} onApply={(amount) => patch({ quote_multiplier: amount })} />
          )}
          {!readOnly && !standalone && (
            <button
              type="button"
              className={commission.admin_help ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
              onClick={() => patch({ admin_help: !commission.admin_help })}
            >
              Multiplicador
            </button>
          )}
        </div>
      )}
      {isOther && (
        <div className="space-y-2">
          <div>
            <label className="label">Monto (Bs)</label>
            {readOnly ? (
              <p className="text-sm text-slate-700">{commission.custom_amount || 0}</p>
            ) : (
              <NumberField field={{ value: commission.custom_amount || 0, onCommit: (amount) => patch({ custom_amount: amount }) }} />
            )}
          </div>
          <div>
            <label className="label">Qué hizo</label>
            {readOnly ? (
              <p className="text-sm text-slate-700">{commission.custom_note || '—'}</p>
            ) : (
              <input
                className="input text-sm"
                maxLength={NOTE_LIMIT}
                value={commission.custom_note || ''}
                onChange={(event) => patch({ custom_note: event.target.value.slice(0, NOTE_LIMIT) })}
              />
            )}
          </div>
          {!standalone && (readOnly ? (
            <p className="text-xs text-slate-500">{commission.custom_technician || 'Sin asignar'}</p>
          ) : (
            <MechanicSearch
              value={commission.custom_technician || ''}
              onChange={(name) => patch({ custom_technician: name })}
              placeholder="Quién lo hizo"
            />
          ))}
        </div>
      )}
    </div>
  )
}
