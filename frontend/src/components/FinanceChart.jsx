import { formatCurrency } from '../services/api'

const BARS = [
  { key: 'today', label: 'Hoy' },
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
]

export default function FinanceChart({ trends }) {
  if (!trends) return null
  const rows = BARS.map((b) => {
    const row = trends[b.key] || {}
    return {
      ...b,
      income: Number(row.total_ingresos) || 0,
      expense: Number(row.total_gastos) || 0,
    }
  })
  const max = Math.max(1, ...rows.flatMap((r) => [r.income, r.expense]))

  return (
    <div className="card p-4">
      <h2 className="font-semibold mb-1">Ganancias y gastos</h2>
      <p className="text-xs text-slate-500 mb-4">Comparativa del día, la semana y el mes</p>
      <div className="flex items-end justify-around gap-3 h-44 px-1">
        {rows.map((r) => (
          <div key={r.key} className="flex-1 max-w-[110px] flex flex-col items-center">
            <div className="flex items-end justify-center gap-1.5 h-36 w-full">
              <div className="flex flex-col items-center justify-end h-full w-8">
                <span className="text-[10px] text-emerald-700 font-semibold mb-1 leading-none">
                  {r.income ? Math.round(r.income) : ''}
                </span>
                <div
                  className="w-full rounded-t-md bg-emerald-500 min-h-[4px]"
                  style={{ height: `${Math.max(4, (r.income / max) * 100)}%` }}
                />
              </div>
              <div className="flex flex-col items-center justify-end h-full w-8">
                <span className="text-[10px] text-red-700 font-semibold mb-1 leading-none">
                  {r.expense ? Math.round(r.expense) : ''}
                </span>
                <div
                  className="w-full rounded-t-md bg-red-400 min-h-[4px]"
                  style={{ height: `${Math.max(4, (r.expense / max) * 100)}%` }}
                />
              </div>
            </div>
            <p className="text-xs font-semibold text-slate-700 mt-2">{r.label}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-center gap-4 mt-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" /> Ingresos</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-400" /> Gastos</span>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4 text-center text-xs">
        {rows.map((r) => (
          <div key={r.key} className="rounded-lg bg-slate-50 p-2">
            <p className="font-semibold text-slate-500 mb-1">{r.label}</p>
            <p className="text-emerald-700 font-medium">{formatCurrency(r.income)}</p>
            <p className="text-red-600 font-medium">{formatCurrency(r.expense)}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
