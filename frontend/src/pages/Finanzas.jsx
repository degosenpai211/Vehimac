import { useEffect, useState } from 'react'
import { Plus, Trash2, TrendingUp, TrendingDown, Wallet } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import StatCard from '../components/StatCard'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate } from '../services/api'

const emptyForm = { type: 'ingreso', description: '', amount: '', category: 'General', date: '' }

const TYPE_STYLES = {
  ingreso: 'bg-green-100 text-green-800',
  gasto: 'bg-red-100 text-red-800',
}

export default function Finanzas() {
  const [records, setRecords] = useState([])
  const [monthly, setMonthly] = useState(null)
  const [daily, setDaily] = useState(null)
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
      const [list, monthlySum, dailySum] = await Promise.all([
        api.getFinances(params),
        api.getMonthlySummary(),
        api.getDailySummary(),
      ])
      setRecords(list)
      setMonthly(monthlySum)
      setDaily(dailySum)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const openCreate = () => {
    setForm(emptyForm)
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = {
        type: form.type,
        description: form.description,
        amount: Number(form.amount),
        category: form.category,
      }
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

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar este registro?')) return
    try {
      await api.deleteFinance(id)
      toast('Registro eliminado', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-slate-500">Ingresos y gastos del taller</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Nuevo registro
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {daily && (
          <StatCard
            title="Balance hoy"
            value={formatCurrency(daily.balance)}
            subtitle={`${formatCurrency(daily.total_ingresos)} ing. / ${formatCurrency(daily.total_gastos)} gast.`}
            icon={Wallet}
            color={daily.balance >= 0 ? 'green' : 'red'}
          />
        )}
        {monthly && (
          <>
            <StatCard title="Ingresos del mes" value={formatCurrency(monthly.total_ingresos)} icon={TrendingUp} color="green" />
            <StatCard title="Gastos del mes" value={formatCurrency(monthly.total_gastos)} icon={TrendingDown} color="red" />
          </>
        )}
      </div>

      <div className="flex gap-2">
        {[
          { value: '', label: 'Todos' },
          { value: 'ingreso', label: 'Ingresos' },
          { value: 'gasto', label: 'Gastos' },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filter === value ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? <Loading /> : records.length === 0 ? (
        <EmptyState
          message="No hay registros financieros"
          action={<button onClick={openCreate} className="btn-primary">Agregar primer registro</button>}
        />
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 border-b">
                <tr>
                  <th className="text-left p-3 font-medium text-slate-600">Fecha</th>
                  <th className="text-left p-3 font-medium text-slate-600">Tipo</th>
                  <th className="text-left p-3 font-medium text-slate-600">Descripción</th>
                  <th className="text-left p-3 font-medium text-slate-600 hidden sm:table-cell">Categoría</th>
                  <th className="text-right p-3 font-medium text-slate-600">Monto</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {records.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-3 text-slate-500">{formatDate(r.date)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[r.type]}`}>
                        {r.type === 'ingreso' ? 'Ingreso' : 'Gasto'}
                      </span>
                    </td>
                    <td className="p-3 font-medium">{r.description}</td>
                    <td className="p-3 hidden sm:table-cell">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs">{r.category}</span>
                    </td>
                    <td className={`p-3 text-right font-medium ${r.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                      {r.type === 'gasto' ? '-' : ''}{formatCurrency(r.amount)}
                    </td>
                    <td className="p-3">
                      <button onClick={() => handleDelete(r.id)} className="p-1.5 rounded hover:bg-red-50 text-red-500">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo registro">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Tipo *</label>
            <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
              <option value="ingreso">Ingreso</option>
              <option value="gasto">Gasto</option>
            </select>
          </div>
          <div>
            <label className="label">Descripción *</label>
            <input className="input" required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Monto *</label>
              <input type="number" min="0.01" step="0.01" className="input" required value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            </div>
            <div>
              <label className="label">Fecha</label>
              <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Categoría</label>
            <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
