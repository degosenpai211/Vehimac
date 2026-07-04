import { useEffect, useState } from 'react'
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import StatCard from '../components/StatCard'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate } from '../services/api'

const emptyForm = { type: 'ingreso', description: '', amount: '', category: 'General', date: '' }
const TYPE_STYLES = { ingreso: 'bg-green-100 text-green-800', gasto: 'bg-red-100 text-red-800' }

export default function Finanzas() {
  const [records, setRecords] = useState([])
  const [periods, setPeriods] = useState(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = filter ? { type: filter } : {}
      const [list, periodData] = await Promise.all([
        api.getFinances(params),
        api.getPeriodSummaries(),
      ])
      setRecords(list)
      setPeriods(periodData)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = { type: form.type, description: form.description, amount: Number(form.amount), category: form.category }
      if (form.date) data.date = form.date
      await api.createFinance(data)
      toast('Registro creado', 'success')
      setModalOpen(false)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const PeriodCard = ({ data, highlight }) => (
    <div className={`card p-4 ${highlight ? 'ring-2 ring-brand-300' : ''}`}>
      <h3 className="font-semibold text-sm text-slate-600 mb-3">{data.period}</h3>
      <div className="space-y-2 text-sm">
        <div className="flex justify-between"><span>Ingresos</span><span className="text-green-600 font-medium">{formatCurrency(data.total_ingresos)}</span></div>
        <div className="flex justify-between"><span>Gastos</span><span className="text-red-600 font-medium">{formatCurrency(data.total_gastos)}</span></div>
        {data.total_adelantos > 0 && (
          <div className="flex justify-between"><span>Adelantos</span><span className="text-blue-600 font-medium">{formatCurrency(data.total_adelantos)}</span></div>
        )}
        <div className="flex justify-between pt-2 border-t font-bold">
          <span>Balance</span>
          <span className={data.balance >= 0 ? 'text-green-600' : 'text-red-600'}>{formatCurrency(data.balance)}</span>
        </div>
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-slate-500">Ingresos, gastos y adelantos</p>
        </div>
        <button onClick={() => { setForm(emptyForm); setModalOpen(true) }} className="btn-primary">
          <Plus size={18} /> Nuevo registro
        </button>
      </div>

      {periods && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <PeriodCard data={periods.today} highlight />
          <PeriodCard data={periods.week} />
          <PeriodCard data={periods.last_month} />
        </div>
      )}

      {periods?.today && (
        <div className="grid grid-cols-3 gap-3">
          <StatCard title="Ingresos hoy" value={formatCurrency(periods.today.total_ingresos)} icon={TrendingUp} color="green" />
          <StatCard title="Gastos hoy" value={formatCurrency(periods.today.total_gastos)} icon={TrendingDown} color="red" />
          <StatCard title="Balance hoy" value={formatCurrency(periods.today.balance)} icon={Wallet} color={periods.today.balance >= 0 ? 'green' : 'red'} />
        </div>
      )}

      <div className="flex gap-2">
        {[{ value: '', label: 'Todos' }, { value: 'ingreso', label: 'Ingresos' }, { value: 'gasto', label: 'Gastos' }].map(({ value, label }) => (
          <button key={value} onClick={() => setFilter(value)} className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filter === value ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : records.length === 0 ? (
        <EmptyState message="No hay registros" />
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left p-3">Fecha</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-left p-3">Descripción</th>
                <th className="text-right p-3">Monto</th>
                <th className="p-3 w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {records.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="p-3 text-slate-500">{formatDate(r.date)}</td>
                  <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${TYPE_STYLES[r.type]}`}>{r.type === 'ingreso' ? 'Ingreso' : 'Gasto'}</span></td>
                  <td className="p-3 font-medium">{r.description}</td>
                  <td className={`p-3 text-right font-medium ${r.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                    {r.type === 'gasto' ? '-' : ''}{formatCurrency(r.amount)}
                  </td>
                  <td className="p-3">
                    <button onClick={async () => { if (confirm('¿Eliminar?')) { await api.deleteFinance(r.id); load() } }} className="text-red-500 p-1"><Trash2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo registro">
        <form onSubmit={handleSubmit} className="space-y-4">
          <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
            <option value="ingreso">Ingreso</option>
            <option value="gasto">Gasto</option>
          </select>
          <input className="input" required placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min="0.01" step="0.01" className="input" required placeholder="Monto" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">Crear</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
