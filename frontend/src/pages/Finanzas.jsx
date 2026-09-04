import { useEffect, useState } from 'react'
import { Plus, Trash2, TrendingUp, Wallet, QrCode, Banknote } from 'lucide-react'
import Modal from '../components/Modal'
import ProductQrModal from '../components/ProductQrModal'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import SalarySection from '../components/SalarySection'
import ResultsSection from '../components/ResultsSection'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate } from '../services/api'
import { catalogForType, categoryLabel } from '../utils/financeCatalog'

const emptyForm = { type: 'ingreso', description: '', amount: '', category: 'Otros ingresos', date: '' }
const TYPE_STYLES = { ingreso: 'bg-green-100 text-green-800', gasto: 'bg-red-100 text-red-800' }
const TABS = [
  { id: 'resultados', label: 'Resultados' },
  { id: 'movimientos', label: 'Movimientos' },
  { id: 'salarios', label: 'Salarios' },
]

function typeLabel(type) {
  return type === 'ingreso' ? 'Ingreso' : 'Egreso'
}

export default function Finanzas() {
  const [tab, setTab] = useState('resultados')
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [plasticOpen, setPlasticOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = filter ? { type: filter } : {}
      const list = await api.getFinances(params)
      setRecords(list)
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

  const setType = (type) => {
    const first = catalogForType(type)[0]
    setForm({ ...form, type, category: first?.label || form.category })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Finanzas</h1>
          <p className="text-sm text-slate-500">Ingresos, egresos y sueldos del taller</p>
        </div>
        {tab !== 'salarios' && (
          <div className="flex gap-2">
            <button type="button" onClick={() => setPlasticOpen(true)} className="btn-secondary flex-1 sm:flex-none min-h-[44px]">
              <QrCode size={18} /> <span className="hidden sm:inline">Compra</span> Plastic 27
            </button>
            <button
              type="button"
              onClick={() => { setForm(emptyForm); setModalOpen(true) }}
              className="btn-primary flex-1 sm:flex-none min-h-[44px]"
            >
              <Plus size={18} /> Nuevo registro
            </button>
          </div>
        )}
      </div>

      <div className="flex p-1 bg-slate-100 rounded-xl">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`flex-1 min-h-[44px] rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-1.5 ${
              tab === t.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'
            }`}
          >
            {t.id === 'salarios' ? <Banknote size={16} /> : t.id === 'resultados' ? <TrendingUp size={16} /> : <Wallet size={16} />}
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'salarios' ? (
        <SalarySection onPaid={load} embedded />
      ) : tab === 'resultados' ? (
        <ResultsSection onChanged={load} />
      ) : (
        <>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
            {[
              { value: '', label: 'Todos' },
              { value: 'ingreso', label: 'Ingresos' },
              { value: 'gasto', label: 'Egresos' },
            ].map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setFilter(value)}
                className={`px-3 min-h-[44px] sm:min-h-0 sm:py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
                  filter === value ? 'bg-brand-700 text-white' : 'bg-white border border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? <Loading /> : records.length === 0 ? (
            <EmptyState message="No hay registros" />
          ) : (
            <>
              <div className="sm:hidden space-y-2">
                {records.map((r) => (
                  <div key={r.id} className="card p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-slate-800 leading-snug">{r.description}</p>
                        <p className="text-xs text-slate-400 mt-1">{formatDate(r.date)} · {categoryLabel(r.category)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={async () => { if (confirm('¿Eliminar?')) { await api.deleteFinance(r.id); load() } }}
                        className="text-red-500 p-2 min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${TYPE_STYLES[r.type]}`}>{typeLabel(r.type)}</span>
                      <span className={`font-semibold ${r.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                        {r.type === 'gasto' ? '-' : ''}{formatCurrency(r.amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden sm:block card overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      <th className="text-left p-3">Fecha</th>
                      <th className="text-left p-3">Tipo</th>
                      <th className="text-left p-3">Descripción</th>
                      <th className="text-left p-3">Rubro</th>
                      <th className="text-right p-3">Monto</th>
                      <th className="p-3 w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {records.map((r) => (
                      <tr key={r.id} className="hover:bg-slate-50">
                        <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(r.date)}</td>
                        <td className="p-3"><span className={`px-2 py-0.5 rounded text-xs ${TYPE_STYLES[r.type]}`}>{typeLabel(r.type)}</span></td>
                        <td className="p-3 font-medium">{r.description}</td>
                        <td className="p-3 text-slate-500">{categoryLabel(r.category)}</td>
                        <td className={`p-3 text-right font-medium whitespace-nowrap ${r.type === 'ingreso' ? 'text-green-600' : 'text-red-600'}`}>
                          {r.type === 'gasto' ? '-' : ''}{formatCurrency(r.amount)}
                        </td>
                        <td className="p-3">
                          <button type="button" onClick={async () => { if (confirm('¿Eliminar?')) { await api.deleteFinance(r.id); load() } }} className="text-red-500 p-1">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      <ProductQrModal
        open={plasticOpen}
        onClose={() => setPlasticOpen(false)}
        onPaid={() => {
          toast('Compra Plastic 27 registrada', 'success')
          load()
        }}
      />
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nuevo registro">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {[
              { id: 'ingreso', label: 'Ingreso' },
              { id: 'gasto', label: 'Egreso' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setType(opt.id)}
                className={`min-h-[44px] rounded-lg text-sm font-semibold border ${
                  form.type === opt.id
                    ? opt.id === 'ingreso'
                      ? 'bg-green-600 text-white border-green-600'
                      : 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-slate-600 border-slate-200'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div>
            <label className="label">Rubro</label>
            <select className="input" required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              {catalogForType(form.type).map((c) => (
                <option key={c.id} value={c.label}>{c.label}</option>
              ))}
            </select>
          </div>
          <input className="input" required placeholder="Descripción" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input type="number" min="0.01" step="0.01" className="input" required placeholder="Monto (Bs.)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input type="date" className="input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary min-h-[44px]">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary min-h-[44px]">Crear</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
