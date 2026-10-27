import { useEffect, useState } from 'react'
import { Calculator } from 'lucide-react'
import Modal from './Modal'
import MechanicSearch from './MechanicSearch'
import CommissionRecord from './CommissionRecord'
import { api } from '../services/api'
import { useToast } from './Toast'
import { PROCESS_STEPS, emptyCommission, emptyStep } from '../utils/process'

const TIMED_STEPS = new Set(['soldadura', 'afinado'])
const OPENING = {
  efficiency: 0.7,
  margin: 0.5,
  plastix_price: 360,
  plastix_cm: 120,
}

function blankProcess() {
  return {
    steps: PROCESS_STEPS.map((step) => emptyStep(step.id)),
    commission: emptyCommission(),
  }
}

function withMaker(process, name) {
  return {
    steps: process.steps.map((step) => (
      TIMED_STEPS.has(step.id) ? { ...step, technician: name } : step
    )),
    commission: {
      ...process.commission,
      mount_technician: process.commission.mount_technician || name,
      arm_technician: process.commission.arm_technician || name,
      custom_technician: process.commission.custom_technician || name,
    },
  }
}

function percentOf(ratio) {
  return String(Math.round(Number(ratio) * 1000) / 10)
}

function ratioOf(text) {
  const raw = String(text).trim()
  if (!raw) return null
  const number = Number(raw.replace(',', '.'))
  if (!Number.isFinite(number) || number < 1 || number > 100) return null
  return Math.round(number * 10) / 1000
}

function moneyOf(text) {
  const number = Number(String(text).replace(',', '.'))
  if (!Number.isFinite(number) || number < 0) return null
  return Math.round(number * 100) / 100
}

function perCm(price, width) {
  if (!width) return 0
  return Math.round((price / width) * 100) / 100
}

function SettingField({ field }) {
  const { label, value, onChange } = field
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input className="input text-sm" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  )
}

export default function PieceCalculator() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [maker, setMaker] = useState('')
  const [process, setProcess] = useState(blankProcess)
  const [saved, setSaved] = useState(OPENING)
  const [efficiency, setEfficiency] = useState(percentOf(OPENING.efficiency))
  const [margin, setMargin] = useState(percentOf(OPENING.margin))
  const [plastixPrice, setPlastixPrice] = useState(String(OPENING.plastix_price))
  const [plastixCm, setPlastixCm] = useState(String(OPENING.plastix_cm))
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    let cancelled = false
    api.getCalculatorSettings()
      .then((body) => {
        if (cancelled || !body) return
        setSaved(body)
        setEfficiency(percentOf(body.efficiency))
        setMargin(percentOf(body.margin))
        setPlastixPrice(String(body.plastix_price))
        setPlastixCm(String(body.plastix_cm))
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open])

  const chooseMaker = (name) => {
    setMaker(name)
    setProcess((current) => withMaker(current, name))
  }

  const draft = {
    efficiency: ratioOf(efficiency) ?? saved.efficiency,
    margin: ratioOf(margin) ?? saved.margin,
    plastix_price: moneyOf(plastixPrice) ?? saved.plastix_price,
    plastix_cm: moneyOf(plastixCm) || saved.plastix_cm,
  }

  const save = async () => {
    setSaving(true)
    try {
      const body = await api.saveCalculatorSettings(draft)
      setSaved(body)
      toast('Configuración guardada', 'success')
    } catch (error) {
      toast(error.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Calculadora"
        className="group relative inline-flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 text-amber-950 shadow-lg shadow-amber-400/40 ring-1 ring-amber-200 transition hover:shadow-amber-300/70 hover:brightness-105"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <Calculator size={20} className="relative" />
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Cotización" size="wide">
        <div className="space-y-3">
            <p className="text-sm text-slate-500">No se guarda en la orden. Sirve para ver cuánto costaría la pieza.</p>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-800">Parámetros actuales</p>
              <p className="mt-1 text-xs text-slate-500">
                Eficiencia {percentOf(saved.efficiency)}% · Margen {percentOf(saved.margin)}% · Plastix {perCm(saved.plastix_price, saved.plastix_cm)} Bs/cm
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <SettingField field={{ label: 'Eficiencia %', value: efficiency, onChange: setEfficiency }} />
                <SettingField field={{ label: 'Margen bruto %', value: margin, onChange: setMargin }} />
                <SettingField field={{ label: 'Plastix Bs', value: plastixPrice, onChange: setPlastixPrice }} />
                <SettingField field={{ label: 'Plastix cm', value: plastixCm, onChange: setPlastixCm }} />
              </div>
              <p className="mt-2 text-xs text-slate-500">Con lo escrito: {perCm(draft.plastix_price, draft.plastix_cm)} Bs/cm.</p>
              <button type="button" className="btn-secondary btn-sm mt-2" disabled={saving} onClick={save}>
                {saving ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
            <label className="label">Quién la haría</label>
            <MechanicSearch
              value={maker}
              onChange={chooseMaker}
              placeholder="Nombre, para usar su hora"
              uniqueNames
              flow
            />
            <CommissionRecord
              standalone
              settings={draft}
              process={process}
              onChange={(commission) => setProcess((current) => withMaker({ ...current, commission }, maker))}
            />
        </div>
      </Modal>
    </>
  )
}
