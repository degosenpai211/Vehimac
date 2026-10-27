import { useState } from 'react'
import { Calculator } from 'lucide-react'
import Modal from './Modal'
import MechanicSearch from './MechanicSearch'
import CommissionRecord from './CommissionRecord'
import { PROCESS_STEPS, emptyCommission, emptyStep } from '../utils/process'

const TIMED_STEPS = new Set(['soldadura', 'afinado'])

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

export default function PieceCalculator() {
  const [open, setOpen] = useState(false)
  const [maker, setMaker] = useState('')
  const [process, setProcess] = useState(blankProcess)

  const chooseMaker = (name) => {
    setMaker(name)
    setProcess((current) => withMaker(current, name))
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative inline-flex min-h-[44px] items-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-amber-300 via-yellow-200 to-amber-400 px-5 py-2.5 text-sm font-bold text-amber-950 shadow-lg shadow-amber-400/40 ring-1 ring-amber-200 transition hover:shadow-amber-300/70 hover:brightness-105"
      >
        <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/70 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
        <Calculator size={18} className="relative" />
        <span className="relative">Calculadora</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Calculadora" size="lg">
        <p className="mb-3 text-sm text-slate-500">No se guarda en la orden. Sirve para ver cuánto costaría la pieza.</p>
        <label className="label">Quién la haría</label>
        <MechanicSearch value={maker} onChange={chooseMaker} placeholder="Nombre, para usar su hora" />
        <CommissionRecord
          standalone
          process={process}
          onChange={(commission) => setProcess((current) => withMaker({ ...current, commission }, maker))}
        />
      </Modal>
    </>
  )
}
