import { useEffect, useState } from 'react'
import { Banknote, Pencil, Wallet } from 'lucide-react'
import Modal from './Modal'
import { useToast } from './Toast'
import { api, formatCurrency, formatDate } from '../services/api'

const MODE_LABEL = { fixed: 'Sueldo fijo', per_job: 'Por trabajos', both: 'Fijo + trabajos' }
const PERIOD_LABEL = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
const ROLE_LABEL = { designer: 'Diseñador', mechanic: 'Mecánico', admin: 'Administrativo' }
const PERIOD_HINT = {
  weekly: 'Semana: lunes a sábado. Se paga el sábado.',
  biweekly: 'Quincena: dos semanas lunes a sábado. Se paga el sábado de la segunda semana.',
  monthly: 'Mes: del día 1 al último día. Se paga el último día del mes. Después hay 5 días hábiles de plazo.',
}
const STATUS = {
  pagado: { label: 'Pagado', cls: 'bg-emerald-50 text-emerald-700' },
  parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-800' },
  en_plazo: { label: 'En plazo legal', cls: 'bg-brand-50 text-brand-700' },
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-800' },
  vencido: { label: 'Vencido', cls: 'bg-red-50 text-red-700' },
  proximo: { label: 'Próximo', cls: 'bg-slate-100 text-slate-600' },
  sin_config: { label: 'Sin sueldo', cls: 'bg-slate-100 text-slate-500' },
}
const PAID_TOLERANCE = 0.009

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function defaultWorkStart(worker) {
  const raw = worker.work_started_on || worker.created_at || ''
  if (raw) return String(raw).slice(0, 10)
  return todayIso()
}

function leftoverOf(worker) {
  const remaining = worker.remaining_base
  if (remaining != null && remaining !== '') {
    const value = Number(remaining)
    if (Number.isFinite(value)) {
      if (value <= PAID_TOLERANCE) return 0
      return Math.round(value * 100) / 100
    }
  }
  const base = Number(worker.salary_base) || 0
  const paid = Number(worker.paid_sum) || 0
  const leftover = base - paid
  if (leftover <= PAID_TOLERANCE) return 0
  return Math.round(leftover * 100) / 100
}

function workersWhoCanAdvance(workers) {
  return workers.filter((worker) => leftoverOf(worker) > 0 && worker.salary_mode !== 'per_job')
}

function emptyAdvance(worker) {
  return {
    mechanic_id: worker.id,
    amount: '',
    date: todayIso(),
    period_key: worker.period_key || '',
  }
}

function emptyPay(worker) {
  const leftover = leftoverOf(worker)
  const showBase = worker.salary_mode !== 'per_job'
  const showExtra = worker.salary_mode !== 'fixed'
  return {
    base: showBase && leftover > 0 ? String(leftover) : '',
    extra: showExtra ? '' : '',
    date: new Date().toISOString().slice(0, 10),
    period_key: worker.period_key || '',
  }
}

export default function SalarySection({ onPaid, embedded = false }) {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(null)
  const [pay, setPay] = useState(null)
  const [form, setForm] = useState({})
  const [payForm, setPayForm] = useState({ base: '', extra: '', date: '' })
  const [advance, setAdvance] = useState(null)
  const [advanceForm, setAdvanceForm] = useState({ amount: '', date: '', mechanic_id: '' })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const workers = board?.workers || []

  const load = async () => {
    setLoading(true)
    try {
      setBoard(await api.getSalaryBoard())
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const openConfig = (w) => {
    const isAdmin = w.role === 'admin'
    setConfig(w)
    setForm({
      salary_base: String(w.salary_base || ''),
      salary_mode: isAdmin ? 'fixed' : (w.salary_mode || 'both'),
      salary_period: w.salary_period || 'monthly',
      pay_day: String(w.pay_day ?? (w.salary_period === 'weekly' ? 4 : 30)),
      work_started_on: defaultWorkStart(w),
    })
  }

  const saveConfig = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateMechanic(config.id, {
        salary_base: Number(form.salary_base) || 0,
        salary_mode: config.role === 'admin' ? 'fixed' : form.salary_mode,
        salary_period: form.salary_period,
        pay_day: Number(form.pay_day) || (form.salary_period === 'weekly' ? 4 : 30),
        work_started_on: form.work_started_on || null,
      })
      toast('Sueldo actualizado', 'success')
      setConfig(null)
      await load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const openPay = (w) => {
    setPay(w)
    setPayForm(emptyPay(w))
  }

  const submitPay = async (e) => {
    e.preventDefault()
    const base = Number(payForm.base) || 0
    const extra = Number(payForm.extra) || 0
    if (base + extra <= 0) {
      toast('El pago debe ser mayor a 0', 'error')
      return
    }
    const leftover = leftoverOf(pay)
    const payingCurrent = (payForm.period_key || pay.period_key) === pay.period_key
    if (payingCurrent && pay.salary_mode !== 'per_job' && base > leftover + PAID_TOLERANCE) {
      toast(`El sueldo base no puede pasar lo que falta (${formatCurrency(leftover)})`, 'error')
      return
    }
    setSaving(true)
    try {
      await api.paySalary({
        mechanic_id: pay.id,
        period_key: payForm.period_key || pay.period_key,
        base_amount: base,
        extra_amount: extra,
        date: payForm.date || null,
      })
      toast('Salario registrado como egreso', 'success')
      setPay(null)
      await load()
      onPaid?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const openAdvance = () => {
    const eligible = workersWhoCanAdvance(workers)
    const first = eligible[0]
    if (!first) {
      toast('Nadie tiene sueldo pendiente para adelantar', 'error')
      return
    }
    setAdvance(true)
    setAdvanceForm(emptyAdvance(first))
  }

  const changeAdvanceWorker = (mechanicId) => {
    const worker = workers.find((row) => row.id === mechanicId)
    if (!worker) return
    setAdvanceForm(emptyAdvance(worker))
  }

  const submitAdvance = async (e) => {
    e.preventDefault()
    const worker = workers.find((row) => row.id === advanceForm.mechanic_id)
    if (!worker) {
      toast('Elegí a quién se le adelanta', 'error')
      return
    }
    const amount = Number(advanceForm.amount) || 0
    const leftover = leftoverOf(worker)
    if (amount <= 0) {
      toast('El adelanto debe ser mayor a 0', 'error')
      return
    }
    if (amount > leftover + PAID_TOLERANCE) {
      toast(`El adelanto no puede pasar el sueldo pendiente (${formatCurrency(leftover)})`, 'error')
      return
    }
    setSaving(true)
    try {
      await api.paySalaryAdvance({
        mechanic_id: worker.id,
        period_key: advanceForm.period_key || worker.period_key,
        amount,
        date: advanceForm.date || null,
      })
      toast('Adelanto registrado como egreso', 'success')
      setAdvance(null)
      await load()
      onPaid?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const eligibleForAdvance = workersWhoCanAdvance(workers)
  const selectedAdvanceWorker = workers.find((row) => row.id === advanceForm.mechanic_id)
  const payTotal = (Number(payForm.base) || 0) + (Number(payForm.extra) || 0)
  const payLeftover = pay ? leftoverOf(pay) : 0
  const payingCurrentPeriod = Boolean(pay) && payForm.period_key === pay.period_key
  const payShowsCurrentAdvance = payingCurrentPeriod && (Number(pay.advance_sum) || 0) > 0
  const currentBaseCovered = payingCurrentPeriod && payLeftover <= 0

  return (
    <div className="space-y-3">
      {!embedded && (
        <div>
          <h2 className="text-lg font-semibold">Salarios</h2>
        </div>
      )}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
        <p className="text-sm text-slate-500">
          Sueldo fijo, por trabajos o ambos. En mensual hay 5 días hábiles desde el día de pago.
        </p>
        {board && (
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <p className="text-sm text-slate-600 sm:whitespace-nowrap">
              Pagado este mes: <span className="font-bold">{formatCurrency(board.month_total)}</span>
            </p>
            <button
              type="button"
              className="btn-secondary btn-sm min-h-[44px] sm:min-h-0"
              onClick={openAdvance}
              disabled={eligibleForAdvance.length === 0}
            >
              <Wallet size={14} /> Adelantos
            </button>
          </div>
        )}
      </div>

      {(board?.overdue > 0 || board?.due_soon > 0) && (
        <div className="flex flex-wrap gap-2 text-xs font-medium">
          {board.overdue > 0 && (
            <span className="px-2 py-1 rounded-full bg-red-50 text-red-700">{board.overdue} vencido{board.overdue === 1 ? '' : 's'}</span>
          )}
          {board.due_soon > 0 && (
            <span className="px-2 py-1 rounded-full bg-brand-50 text-brand-700">{board.due_soon} en plazo legal</span>
          )}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Cargando salarios...</p>
      ) : workers.length === 0 ? (
        <p className="text-sm text-slate-400">No hay integrantes activos. Agregalos en Equipo.</p>
      ) : (
        <ul className="card divide-y divide-slate-100">
          {workers.map((w) => {
            const st = STATUS[w.status] || STATUS.proximo
            const leftover = leftoverOf(w)
            return (
              <li key={w.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{w.name}</p>
                    <p className="text-xs text-slate-500">
                      {ROLE_LABEL[w.role] || 'Mecánico'} · {MODE_LABEL[w.salary_mode]} · {PERIOD_LABEL[w.salary_period]}
                      {w.salary_mode !== 'per_job' && w.salary_base > 0 ? ` · ${formatCurrency(w.salary_base)}` : ''}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>{w.period_label} · día de pago {formatDate(w.payday)}</p>
                  {w.work_started_on && (
                    <p>Trabaja desde {formatDate(w.work_started_on)}</p>
                  )}
                  {w.legal_window && w.status !== 'pagado' && w.status !== 'sin_config' && (
                    <p>Pagar hasta {formatDate(w.deadline)} (5 días hábiles)</p>
                  )}
                  {w.paid_sum > 0 && <p>Pagado en este período: {formatCurrency(w.paid_sum)}</p>}
                  {w.advance_sum > 0 && <p>Adelanto: {formatCurrency(w.advance_sum)}</p>}
                  {w.salary_mode !== 'per_job' && leftover > 0 && (
                    <p>Falta: {formatCurrency(leftover)}</p>
                  )}
                  {w.unpaid_previous > 0 && (
                    <p>
                      Hay {w.unpaid_previous} período{w.unpaid_previous === 1 ? '' : 's'} anterior{w.unpaid_previous === 1 ? '' : 'es'} sin registrar.
                      Al pagar podés elegir cuál.
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button type="button" className="btn-secondary btn-sm flex-1 sm:flex-none min-h-[44px] sm:min-h-0" onClick={() => openConfig(w)}>
                    <Pencil size={14} /> Sueldo
                  </button>
                  <button type="button" className="btn-primary btn-sm flex-1 sm:flex-none min-h-[44px] sm:min-h-0" onClick={() => openPay(w)}>
                    <Banknote size={14} /> Pagar
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Modal open={!!config} onClose={() => setConfig(null)} title={config ? `Sueldo · ${config.name}` : 'Sueldo'}>
        {config && (
          <form onSubmit={saveConfig} className="space-y-3">
            {config.role !== 'admin' && (
              <div>
                <label className="label">Cómo se paga</label>
                <select className="input" value={form.salary_mode} onChange={(e) => setForm({ ...form, salary_mode: e.target.value })}>
                  <option value="fixed">Sueldo fijo</option>
                  <option value="per_job">Solo por trabajos</option>
                  <option value="both">Fijo + extra por trabajos</option>
                </select>
              </div>
            )}
            <div>
              <label className="label">Período</label>
              <select
                className="input"
                value={form.salary_period}
                onChange={(e) => {
                  const salary_period = e.target.value
                  setForm({
                    ...form,
                    salary_period,
                  })
                }}
              >
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="monthly">Mensual</option>
              </select>
            </div>
            <div>
              <label className="label">Día que empezó a trabajar</label>
              <div className="flex gap-2">
                <input
                  className="input"
                  type="date"
                  value={form.work_started_on || ''}
                  onChange={(e) => setForm({ ...form, work_started_on: e.target.value })}
                  required
                />
                <button
                  type="button"
                  className="btn-secondary shrink-0"
                  onClick={() => setForm({ ...form, work_started_on: todayIso() })}
                >
                  Hoy
                </button>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Si se retrasa, vuelve de vacaciones o pide permiso, cambiá el día. La primera semana o mes puede empezar a mitad.
              </p>
            </div>
            {form.salary_mode !== 'per_job' && (
              <div>
                <label className="label">Sueldo acordado (Bs.)</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salary_base}
                  onChange={(e) => setForm({ ...form, salary_base: e.target.value })}
                />
              </div>
            )}
            <p className="text-xs text-slate-500">{PERIOD_HINT[form.salary_period] || PERIOD_HINT.monthly}</p>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfig(null)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">Guardar</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!advance} onClose={() => setAdvance(null)} title="Adelanto de sueldo">
        {advance && (
          <form onSubmit={submitAdvance} className="space-y-3">
            <div>
              <label className="label">Quién pide el adelanto</label>
              <select
                className="input"
                value={advanceForm.mechanic_id}
                onChange={(e) => changeAdvanceWorker(e.target.value)}
              >
                {eligibleForAdvance.map((worker) => (
                  <option key={worker.id} value={worker.id}>{worker.name}</option>
                ))}
              </select>
            </div>
            {selectedAdvanceWorker && (
              <p className="text-xs text-slate-500">
                {selectedAdvanceWorker.period_label} · pendiente {formatCurrency(leftoverOf(selectedAdvanceWorker))}
              </p>
            )}
            <div>
              <label className="label">Monto del adelanto (Bs.)</label>
              <input
                className="input"
                type="number"
                min="0.01"
                step="0.01"
                max={selectedAdvanceWorker ? leftoverOf(selectedAdvanceWorker) : undefined}
                value={advanceForm.amount}
                onChange={(e) => setAdvanceForm({ ...advanceForm, amount: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input
                type="date"
                className="input"
                value={advanceForm.date}
                onChange={(e) => setAdvanceForm({ ...advanceForm, date: e.target.value })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setAdvance(null)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">Registrar adelanto</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `Pagar · ${pay.name}` : 'Pagar'} size="lg">
        {pay && (
          <form onSubmit={submitPay} className="space-y-3">
            {payShowsCurrentAdvance && (
              <div className="rounded-lg bg-amber-50 text-amber-900 text-sm px-3 py-2">
                {payLeftover > 0
                  ? `Ya se le adelantó ${formatCurrency(pay.advance_sum)} en este período. El resto del sueldo es ${formatCurrency(payLeftover)}. Si seguís, se registra solo ese resto.`
                  : `Ya se le adelantó ${formatCurrency(pay.advance_sum)}. El sueldo de este período ya está cubierto. No hay más sueldo base que pagar.`}
              </div>
            )}
            <div>
              <label className="label">Período</label>
              <select
                className="input"
                value={payForm.period_key}
                onChange={(e) => {
                  const period_key = e.target.value
                  const isCurrent = period_key === pay.period_key
                  const leftover = leftoverOf(pay)
                  let base = ''
                  if (pay.salary_mode !== 'per_job' && isCurrent && leftover > 0) {
                    base = String(leftover)
                  }
                  if (pay.salary_mode !== 'per_job' && !isCurrent) {
                    base = String(pay.salary_base || '')
                  }
                  setPayForm({ ...payForm, period_key, base })
                }}
              >
                {(pay.periods || [{ key: pay.period_key, label: pay.period_label }]).map((p) => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>
            {pay.salary_mode !== 'per_job' && !currentBaseCovered && (
              <div>
                <label className="label">Sueldo base</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payForm.base}
                  onChange={(e) => setPayForm({ ...payForm, base: e.target.value })}
                />
              </div>
            )}
            {pay.salary_mode !== 'fixed' && (
              <div>
                <label className="label">Extra por trabajos</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={payForm.extra}
                  onChange={(e) => setPayForm({ ...payForm, extra: e.target.value })}
                />
                {pay.jobs?.length > 0 ? (
                  <ul className="mt-2 text-xs text-slate-500 space-y-1 max-h-32 overflow-y-auto">
                    {pay.jobs.map((j, i) => (
                      <li key={i}>
                        {j.ot_number ? `OT${j.ot_number}` : 'OT'} · {j.step}
                        {j.part_name ? ` · ${j.part_name}` : ''}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-slate-400 mt-1">Sin trabajos asignados en este período (podés cargar el extra igual).</p>
                )}
              </div>
            )}
            <div>
              <label className="label">Fecha de pago</label>
              <input
                type="date"
                className="input"
                value={payForm.date}
                onChange={(e) => setPayForm({ ...payForm, date: e.target.value })}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-between sm:items-center gap-3 pt-1">
              <span className="text-sm font-semibold inline-flex items-center gap-1">
                <Wallet size={14} /> Total {formatCurrency(payTotal)}
              </span>
              <div className="flex gap-2">
                <button type="button" className="btn-secondary flex-1 sm:flex-none min-h-[44px]" onClick={() => setPay(null)}>Cancelar</button>
                <button type="submit" disabled={saving || payTotal <= 0} className="btn-primary flex-1 sm:flex-none min-h-[44px]">Registrar egreso</button>
              </div>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
