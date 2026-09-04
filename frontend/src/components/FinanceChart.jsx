import { useId, useMemo, useState } from 'react'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatCurrency } from '../services/api'

function compact(n) {
  const v = Math.abs(Number(n) || 0)
  const sign = n < 0 ? '−' : ''
  if (v >= 1_000_000) return `${sign}${(v / 1_000_000).toFixed(1).replace('.', ',')} M`
  if (v >= 1000) return `${sign}${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace('.', ',')} mil`
  return `${sign}${Math.round(v)}`
}

function niceMax(raw) {
  if (raw <= 0) return 1
  const exp = 10 ** Math.floor(Math.log10(raw))
  const n = raw / exp
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * exp
}

function roundTopBar(x, y, w, h, r = 5) {
  if (h <= 0) return ''
  const rr = Math.min(r, w / 2, h)
  return [
    `M ${x} ${y + h}`,
    `L ${x} ${y + rr}`,
    `Q ${x} ${y} ${x + rr} ${y}`,
    `L ${x + w - rr} ${y}`,
    `Q ${x + w} ${y} ${x + w} ${y + rr}`,
    `L ${x + w} ${y + h}`,
    'Z',
  ].join(' ')
}

function buildRows(trends, bars) {
  if (bars) {
    return bars.map((b, i) => ({
      key: `${b.label}-${i}`,
      label: b.label,
      income: Number(b.ingresos) || 0,
      expense: Number(b.egresos) || 0,
    }))
  }
  return [
    { key: 'today', label: 'Hoy' },
    { key: 'week', label: 'Semana' },
    { key: 'month', label: 'Mes' },
  ].map((b) => {
    const row = (trends || {})[b.key] || {}
    return {
      ...b,
      income: Number(row.total_ingresos) || 0,
      expense: Number(row.total_gastos) || 0,
    }
  })
}

export default function FinanceChart({ trends, bars, title, subtitle }) {
  const [active, setActive] = useState(null)
  const uid = useId().replace(/:/g, '')
  const rows = useMemo(() => buildRows(trends, bars), [trends, bars])

  if (!rows.length) return null

  const nets = rows.map((r) => r.income - r.expense)
  const totalIn = rows.reduce((s, r) => s + r.income, 0)
  const totalOut = rows.reduce((s, r) => s + r.expense, 0)
  const net = totalIn - totalOut

  const yMax = niceMax(Math.max(...rows.flatMap((r) => [r.income, r.expense]), ...nets, 1))
  const minNet = Math.min(0, ...nets)
  const yMin = minNet < 0 ? -niceMax(Math.abs(minNet)) : 0
  const span = yMax - yMin || 1
  const tickVals = yMin < 0 ? [yMax, yMax / 2, 0, yMin / 2, yMin] : [yMax, yMax * 0.75, yMax * 0.5, yMax * 0.25, 0]

  const pad = { top: 18, right: 14, bottom: 38, left: 46 }
  const W = 640
  const H = 248
  const innerW = W - pad.left - pad.right
  const innerH = H - pad.top - pad.bottom
  const groupW = innerW / rows.length
  const barW = Math.min(22, Math.max(8, groupW * 0.26))
  const gap = Math.min(6, barW * 0.28)

  const y = (v) => pad.top + innerH - ((v - yMin) / span) * innerH
  const zeroY = y(0)
  const barH = (v) => Math.max(v > 0 ? 4 : 0, ((v - 0) / span) * innerH)

  const tip = active != null ? rows[active] : null
  const tipNet = tip ? tip.income - tip.expense : 0
  const tipLeft = tip
    ? ((pad.left + groupW * active + groupW / 2) / W) * 100
    : 50
  const tipAlign = active === 0 ? 'left' : active === rows.length - 1 ? 'right' : 'center'

  const linePts = rows.map((r, i) => {
    const cx = pad.left + groupW * i + groupW / 2
    return `${cx},${y(r.income - r.expense)}`
  }).join(' ')

  return (
    <div className="card overflow-hidden">
      <div className="px-4 pt-4 pb-3 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-800">{title || 'Ingresos y egresos'}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {subtitle || 'Comparativa del día, la semana y el mes'}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 min-w-0 lg:min-w-[340px]">
          <Kpi label="Ingresos" value={formatCurrency(totalIn)} tone="emerald" />
          <Kpi label="Egresos" value={formatCurrency(totalOut)} tone="rose" />
          <Kpi
            label="Resultado"
            value={formatCurrency(net)}
            tone={net >= 0 ? 'slate' : 'rose'}
            icon={net >= 0 ? TrendingUp : TrendingDown}
          />
        </div>
      </div>

      <div className="px-2 sm:px-3 pb-1">
        <div className="relative rounded-2xl bg-gradient-to-b from-slate-50 to-white border border-slate-100">
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="w-full h-[210px] sm:h-[248px]"
            role="img"
            aria-label="Gráfico de ingresos, egresos y resultado"
          >
            <defs>
              <linearGradient id={`barIn-${uid}`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#047857" />
                <stop offset="55%" stopColor="#10b981" />
                <stop offset="100%" stopColor="#6ee7b7" />
              </linearGradient>
              <linearGradient id={`barOut-${uid}`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#be123c" />
                <stop offset="55%" stopColor="#f43f5e" />
                <stop offset="100%" stopColor="#fda4af" />
              </linearGradient>
              <linearGradient id={`shine-${uid}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#fff" stopOpacity="0.38" />
                <stop offset="50%" stopColor="#fff" stopOpacity="0" />
              </linearGradient>
              <filter id={`shadow-${uid}`} x="-30%" y="-20%" width="160%" height="150%">
                <feDropShadow dx="0" dy="1.5" stdDeviation="1.6" floodColor="#0f172a" floodOpacity="0.16" />
              </filter>
            </defs>

            {tickVals.map((t) => {
              const yy = y(t)
              const isZero = Math.abs(t) < 1e-9
              return (
                <g key={t}>
                  <line
                    x1={pad.left}
                    x2={W - pad.right}
                    y1={yy}
                    y2={yy}
                    stroke={isZero ? '#cbd5e1' : '#e2e8f0'}
                    strokeWidth={isZero ? 1.25 : 1}
                  />
                  <text
                    x={pad.left - 8}
                    y={yy + 3.5}
                    textAnchor="end"
                    fill="#94a3b8"
                    fontSize="10"
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {compact(t)}
                  </text>
                </g>
              )
            })}

            {rows.map((r, i) => {
              const cx = pad.left + groupW * i + groupW / 2
              const xIn = cx - gap / 2 - barW
              const xOut = cx + gap / 2
              const selected = active === i
              const dim = active != null && !selected
              const inH = barH(r.income)
              const outH = barH(r.expense)
              const inY = zeroY - inH
              const outY = zeroY - outH
              const current = i === rows.length - 1 && bars
              return (
                <g
                  key={r.key}
                  className="cursor-pointer"
                  opacity={dim ? 0.38 : 1}
                  onPointerOver={(e) => { if (e.pointerType === 'mouse') setActive(i) }}
                  onPointerOut={(e) => { if (e.pointerType === 'mouse') setActive(null) }}
                  onClick={() => {
                    if (typeof window !== 'undefined' && window.matchMedia('(hover: none)').matches) {
                      setActive((cur) => (cur === i ? null : i))
                    }
                  }}
                >
                  <rect
                    x={pad.left + groupW * i + 2}
                    y={pad.top}
                    width={Math.max(0, groupW - 4)}
                    height={innerH}
                    rx="8"
                    fill={selected ? '#eff6ff' : current ? '#f8fafc' : 'transparent'}
                  />
                  {inH > 0 && (
                    <g filter={`url(#shadow-${uid})`} className="chart-bar" style={{ animationDelay: `${i * 45}ms` }}>
                      <path d={roundTopBar(xIn, inY, barW, inH)} fill={`url(#barIn-${uid})`} />
                      <path d={roundTopBar(xIn, inY, barW, inH)} fill={`url(#shine-${uid})`} />
                    </g>
                  )}
                  {outH > 0 && (
                    <g filter={`url(#shadow-${uid})`} className="chart-bar" style={{ animationDelay: `${i * 45 + 40}ms` }}>
                      <path d={roundTopBar(xOut, outY, barW, outH)} fill={`url(#barOut-${uid})`} />
                      <path d={roundTopBar(xOut, outY, barW, outH)} fill={`url(#shine-${uid})`} />
                    </g>
                  )}
                  {!inH && (
                    <rect x={xIn} y={zeroY - 2} width={barW} height="2" rx="1" fill="#a7f3d0" />
                  )}
                  {!outH && (
                    <rect x={xOut} y={zeroY - 2} width={barW} height="2" rx="1" fill="#fecdd3" />
                  )}
                  <text
                    x={cx}
                    y={H - 12}
                    textAnchor="middle"
                    fill={selected ? '#1e3a8a' : '#64748b'}
                    fontSize={rows.length > 5 ? 10 : 11}
                    fontWeight={selected || current ? '700' : '600'}
                    fontFamily="ui-sans-serif, system-ui, sans-serif"
                  >
                    {r.label}
                  </text>
                </g>
              )
            })}

            {rows.length > 1 && rows.some((r) => r.income || r.expense) && (
              <g>
                <polyline
                  points={linePts}
                  fill="none"
                  stroke="#1d4ed8"
                  strokeWidth="2.25"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {rows.map((r, i) => {
                  const cx = pad.left + groupW * i + groupW / 2
                  const cy = y(r.income - r.expense)
                  return (
                    <circle
                      key={`n-${r.key}`}
                      cx={cx}
                      cy={cy}
                      r={active === i ? 5 : 3.5}
                      fill="#1d4ed8"
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  )
                })}
              </g>
            )}
          </svg>

          {tip && (
            <div
              className="pointer-events-none absolute z-10 top-3 w-[min(220px,calc(100%-1.5rem))] rounded-xl border border-slate-200/80 bg-white/95 shadow-lg shadow-slate-200/80 backdrop-blur-sm px-3 py-2.5"
              style={
                tipAlign === 'left'
                  ? { left: 12 }
                  : tipAlign === 'right'
                    ? { right: 12 }
                    : { left: `${tipLeft}%`, transform: 'translateX(-50%)' }
              }
            >
              <p className="text-[11px] font-semibold text-slate-800 mb-1.5">{tip.label}</p>
              <div className="space-y-1 text-[11px]">
                <p className="flex justify-between gap-4">
                  <span className="text-emerald-700">Ingresos</span>
                  <span className="font-semibold tabular-nums text-slate-800">{formatCurrency(tip.income)}</span>
                </p>
                <p className="flex justify-between gap-4">
                  <span className="text-rose-700">Egresos</span>
                  <span className="font-semibold tabular-nums text-slate-800">{formatCurrency(tip.expense)}</span>
                </p>
                <p className={`flex justify-between gap-4 pt-1 border-t border-slate-100 ${tipNet >= 0 ? 'text-brand-800' : 'text-rose-700'}`}>
                  <span>Resultado</span>
                  <span className="font-semibold tabular-nums">{formatCurrency(tipNet)}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="px-4 pb-3.5 pt-1 flex flex-wrap justify-center gap-x-5 gap-y-1 text-[11px] text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-gradient-to-t from-emerald-700 to-emerald-300 shadow-sm" />
          Ingresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-[3px] bg-gradient-to-t from-rose-700 to-rose-300 shadow-sm" />
          Egresos
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="w-3.5 h-0.5 rounded-full bg-brand-700" />
          Resultado
        </span>
      </div>
    </div>
  )
}

function Kpi({ label, value, tone, icon: Icon }) {
  const tones = {
    emerald: 'bg-emerald-50 border-emerald-100 text-emerald-800',
    rose: 'bg-rose-50 border-rose-100 text-rose-800',
    slate: 'bg-slate-50 border-slate-100 text-slate-800',
  }
  return (
    <div className={`rounded-xl border px-2.5 py-2 min-w-0 ${tones[tone]}`}>
      <p className="text-[10px] uppercase tracking-wide font-semibold opacity-70 truncate">{label}</p>
      <p className="text-xs sm:text-sm font-semibold tabular-nums truncate mt-0.5 flex items-center gap-1">
        {Icon && <Icon size={13} className="shrink-0 opacity-70" />}
        {value}
      </p>
    </div>
  )
}
