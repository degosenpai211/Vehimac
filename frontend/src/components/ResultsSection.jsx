import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import FinanceChart from './FinanceChart'
import { useToast } from './Toast'
import { api, formatCurrency } from '../services/api'

function blank(amount) {
  if (!amount) return <span className="text-slate-300">—</span>
  return formatCurrency(amount)
}

export default function ResultsSection({ onChanged }) {
  const [grain, setGrain] = useState('week')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [cash, setCash] = useState('')
  const [rent1, setRent1] = useState('')
  const [rent2, setRent2] = useState('')
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const pl = await api.getProfitLoss({ grain, offset })
      setData(pl)
      setCash(String(pl.cash_opening ?? ''))
      setRent1(String(pl.rent_1 ?? ''))
      setRent2(String(pl.rent_2 ?? ''))
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [grain, offset])

  const saveSettings = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.updateFinanceSettings({
        cash_opening: Number(cash) || 0,
        rent_1: Number(rent1) || 0,
        rent_2: Number(rent2) || 0,
      })
      toast('Ajustes guardados', 'success')
      setSettingsOpen(false)
      await load()
      onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const chargeRent = async (which) => {
    try {
      await api.payRent(which)
      toast(`Alquiler ${which} registrado`, 'success')
      await load()
      onChanged?.()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const switchGrain = (next) => {
    setGrain(next)
    setOffset(0)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex p-1 bg-slate-100 rounded-xl w-full sm:w-auto">
          {[
            { id: 'week', label: 'Semana' },
            { id: 'month', label: 'Mes' },
          ].map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => switchGrain(g.id)}
              className={`flex-1 sm:flex-none px-4 min-h-[44px] rounded-lg text-sm font-semibold ${
                grain === g.id ? 'bg-white text-brand-800 shadow-sm' : 'text-slate-500'
              }`}
            >
              {g.label}
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button type="button" className="btn-secondary min-h-[44px] min-w-[44px]" onClick={() => setOffset((n) => n - 1)} aria-label="Anterior">
            <ChevronLeft size={18} />
          </button>
          <p className="text-sm font-semibold text-center min-w-[140px]">{data?.label || '—'}</p>
          <button type="button" disabled={offset >= 0} className="btn-secondary min-h-[44px] min-w-[44px] disabled:opacity-40" onClick={() => setOffset((n) => Math.min(0, n + 1))} aria-label="Siguiente">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-slate-400">Armando el estado de resultados...</p>
      ) : data && (
        <>
          <FinanceChart
            bars={data.series}
            title={grain === 'week' ? 'Evolución semanal' : 'Evolución mensual'}
            subtitle="Barras de ingresos y egresos. La línea azul es el resultado de cada período."
          />

          <div className="card overflow-hidden">
            <div className="px-3 py-2 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
              <p className="text-sm font-semibold">Estado de resultados</p>
              <button type="button" className="text-xs font-semibold text-brand-700 min-h-[44px] px-2" onClick={() => setSettingsOpen((v) => !v)}>
                {settingsOpen ? 'Cerrar ajustes' : 'Efectivo y alquileres'}
              </button>
            </div>
            {settingsOpen && (
              <form onSubmit={saveSettings} className="p-3 border-b border-slate-100 grid sm:grid-cols-3 gap-2">
                <div>
                  <label className="label">Efectivo inicial</label>
                  <input className="input" type="number" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} />
                </div>
                <div>
                  <label className="label">Alquiler 1 (fijo)</label>
                  <input className="input" type="number" min="0" step="0.01" value={rent1} onChange={(e) => setRent1(e.target.value)} />
                </div>
                <div>
                  <label className="label">Alquiler 2 (fijo)</label>
                  <input className="input" type="number" min="0" step="0.01" value={rent2} onChange={(e) => setRent2(e.target.value)} />
                </div>
                <div className="sm:col-span-3 flex justify-end">
                  <button type="submit" disabled={saving} className="btn-primary min-h-[44px]">Guardar</button>
                </div>
              </form>
            )}
            <div className="divide-y divide-slate-100">
              {data.groups.map((g) => (
                <div key={g.id}>
                  <div className="px-3 py-2 bg-slate-50 flex justify-between text-xs font-bold uppercase tracking-wide text-slate-500">
                    <span>{g.label}</span>
                    <span>{blank(g.total)}</span>
                  </div>
                  {g.rows.map((row) => (
                    <div key={row.id} className="px-3 py-2 flex items-center justify-between gap-2 text-sm">
                      <span className="text-slate-700">
                        {row.label}
                        {row.source === 'auto' && <span className="ml-1 text-[10px] text-slate-400">auto</span>}
                      </span>
                      <span className="flex items-center gap-2 shrink-0">
                        {row.source === 'rent' && (row.id === 'alquiler_1' ? data.rent_1 : data.rent_2) > 0 && (
                          <button
                            type="button"
                            className="text-[11px] font-semibold text-brand-700 min-h-[36px]"
                            onClick={() => chargeRent(row.id === 'alquiler_1' ? 1 : 2)}
                          >
                            Cargar
                          </button>
                        )}
                        <span className={`font-medium ${row.kind === 'ingreso' ? 'text-emerald-700' : 'text-slate-800'}`}>
                          {blank(row.amount)}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              ))}
              <div className="px-3 py-3 flex justify-between font-bold">
                <span>Resultado del período</span>
                <span className={data.resultado >= 0 ? 'text-emerald-700' : 'text-red-600'}>{formatCurrency(data.resultado)}</span>
              </div>
              <div className="px-3 py-2 flex justify-between text-sm bg-amber-50">
                <span className="text-amber-900">IVA facturado (informativo)</span>
                <span className="font-medium text-amber-900">{blank(data.iva_facturado)}</span>
              </div>
              <div className="px-3 py-3 flex justify-between font-bold bg-slate-50">
                <span>Efectivo</span>
                <span>{formatCurrency(data.efectivo)}</span>
              </div>
            </div>
          </div>

          {(data.rent_1 > 0 || data.rent_2 > 0) && (
            <p className="text-xs text-slate-400">
              Alquileres fijos: tocá <b>Cargar</b> cuando se pague el período. Si esa semana no se pagó, la celda queda vacía.
            </p>
          )}
        </>
      )}
    </div>
  )
}
