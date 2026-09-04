import { useEffect, useState } from 'react'
import { Banknote, Pencil, Wallet } from 'lucide-react'
import Modal from './Modal'
import { useToast } from './Toast'
import { api, formatCurrency, formatDate } from '../services/api'

const MODE_LABEL = { fixed: 'Sueldo fijo', per_job: 'Por trabajos', both: 'Fijo + trabajos' }
const PERIOD_LABEL = { weekly: 'Semanal', biweekly: 'Quincenal', monthly: 'Mensual' }
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo']
const STATUS = {
  pagado: { label: 'Pagado', cls: 'bg-emerald-50 text-emerald-700' },
  parcial: { label: 'Parcial', cls: 'bg-amber-50 text-amber-800' },
  en_plazo: { label: 'En plazo legal', cls: 'bg-brand-50 text-brand-700' },
  pendiente: { label: 'Pendiente', cls: 'bg-amber-50 text-amber-800' },
  vencido: { label: 'Vencido', cls: 'bg-red-50 text-red-700' },
  proximo: { label: 'Próximo', cls: 'bg-slate-100 text-slate-600' },
  sin_config: { label: 'Sin sueldo', cls: 'bg-slate-100 text-slate-500' },
}

function emptyPay(worker) {
  const showBase = worker.salary_mode !== 'per_job'
  const showExtra = worker.salary_mode !== 'fixed'
  return {
    base: showBase ? String(worker.salary_base || '') : '',
    extra: showExtra ? '' : '',
    date: new Date().toISOString().slice(0, 10),
  }
}

export default function SalarySection({ onPaid, embedded = false }) {
  const [board, setBoard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [config, setConfig] = useState(null)
  const [pay, setPay] = useState(null)
  const [form, setForm] = useState({})
  const [payForm, setPayForm] = useState({ base: '', extra: '', date: '' })
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

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
    setConfig(w)
    setForm({
      salary_base: String(w.salary_base || ''),
      salary_mode: w.salary_mode || 'both',
      salary_period: w.salary_period || 'monthly',
      pay_day: String(w.pay_day ?? (w.salary_period === 'weekly' ? 4 : 30)),
    })
  }

  const saveConfig = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateMechanic(config.id, {
        salary_base: Number(form.salary_base) || 0,
        salary_mode: form.salary_mode,
        salary_period: form.salary_period,
        pay_day: Number(form.pay_day) || (form.salary_period === 'weekly' ? 4 : 30),
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
    setSaving(true)
    try {
      await api.paySalary({
        mechanic_id: pay.id,
        period_key: pay.period_key,
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

  const workers = board?.workers || []
  const payTotal = (Number(payForm.base) || 0) + (Number(payForm.extra) || 0)

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
          <p className="text-sm text-slate-600 sm:whitespace-nowrap">
            Pagado este mes: <span className="font-bold">{formatCurrency(board.month_total)}</span>
          </p>
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
            return (
              <li key={w.id} className="p-4 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-800">{w.name}</p>
                    <p className="text-xs text-slate-500">
                      {w.role === 'designer' ? 'Diseñador' : 'Mecánico'} · {MODE_LABEL[w.salary_mode]} · {PERIOD_LABEL[w.salary_period]}
                      {w.salary_mode !== 'per_job' && w.salary_base > 0 ? ` · ${formatCurrency(w.salary_base)}` : ''}
                    </p>
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${st.cls}`}>{st.label}</span>
                </div>
                <div className="text-xs text-slate-500 space-y-0.5">
                  <p>{w.period_label} · día de pago {formatDate(w.payday)}</p>
                  {w.legal_window && w.status !== 'pagado' && w.status !== 'sin_config' && (
                    <p>Pagar hasta {formatDate(w.deadline)} (5 días hábiles)</p>
                  )}
                  {w.paid_sum > 0 && <p>Pagado en este período: {formatCurrency(w.paid_sum)}</p>}
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
            <div>
              <label className="label">Cómo se paga</label>
              <select className="input" value={form.salary_mode} onChange={(e) => setForm({ ...form, salary_mode: e.target.value })}>
                <option value="fixed">Sueldo fijo</option>
                <option value="per_job">Solo por trabajos</option>
                <option value="both">Fijo + extra por trabajos</option>
              </select>
            </div>
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
                    pay_day: salary_period === 'weekly' ? '4' : salary_period === 'monthly' ? '30' : form.pay_day,
                  })
                }}
              >
                <option value="weekly">Semanal</option>
                <option value="biweekly">Quincenal</option>
                <option value="monthly">Mensual</option>
              </select>
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
            {form.salary_period === 'monthly' && (
              <div>
                <label className="label">Día de pago del mes</label>
                <input
                  className="input"
                  type="number"
                  min="1"
                  max="31"
                  value={form.pay_day}
                  onChange={(e) => setForm({ ...form, pay_day: e.target.value })}
                />
                <p className="text-xs text-slate-400 mt-1">Después de ese día hay 5 días hábiles de plazo.</p>
              </div>
            )}
            {form.salary_period === 'weekly' && (
              <div>
                <label className="label">Día de pago</label>
                <select className="input" value={form.pay_day} onChange={(e) => setForm({ ...form, pay_day: e.target.value })}>
                  {WEEKDAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            {form.salary_period === 'biweekly' && (
              <p className="text-xs text-slate-500">Quincena: el 15 y el último día del mes.</p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => setConfig(null)}>Cancelar</button>
              <button type="submit" disabled={saving} className="btn-primary">Guardar</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!pay} onClose={() => setPay(null)} title={pay ? `Pagar · ${pay.name}` : 'Pagar'} size="lg">
        {pay && (
          <form onSubmit={submitPay} className="space-y-3">
            <p className="text-sm text-slate-600">{pay.period_label}</p>
            {pay.salary_mode !== 'per_job' && (
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
