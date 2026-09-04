import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Users, Wrench, Package, Clock, AlertTriangle, Bell, Share,
  Banknote, TrendingUp, CircleDollarSign, Timer,
} from 'lucide-react'
import StatCard from '../components/StatCard'
import AgendaList from '../components/AgendaList'
import FinanceChart from '../components/FinanceChart'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatOT } from '../services/api'
import { ORDER_STATUS } from '../utils/status'
import {
  isIosDevice,
  isStandalonePwa,
  notificationPermission,
  notificationsSupported,
  notifyDeliveries,
  requestNotificationPermission,
} from '../utils/notifications'

const STATUS_NOTE = {
  en_proceso: 'En proceso',
  terminado: 'Para recoger',
}

const STATUS_CHART = [
  { id: 'en_proceso', color: '#f59e0b' },
  { id: 'terminado', color: '#2563eb' },
  { id: 'entregado', color: '#059669' },
]

function polar(cx, cy, r, angle) {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)]
}

function arcPath(cx, cy, r, start, end) {
  const [x1, y1] = polar(cx, cy, r, start)
  const [x2, y2] = polar(cx, cy, r, end)
  const large = end - start > Math.PI ? 1 : 0
  return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`
}

function StatusBreakdown({ counts = {} }) {
  const slices = STATUS_CHART.map((s) => ({
    ...s,
    label: ORDER_STATUS[s.id]?.label || s.id,
    value: Number(counts[s.id]) || 0,
  }))
  const total = slices.reduce((s, x) => s + x.value, 0)
  let angle = -Math.PI / 2
  const rings = slices.map((s) => {
    const frac = total ? s.value / total : 0
    const start = angle
    const sweep = frac * Math.PI * 2
    angle += sweep
    return { ...s, start, end: start + sweep, frac }
  })

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="font-semibold">Órdenes por estado</h2>
          <p className="text-xs text-slate-500 mt-0.5">Distribución actual del taller</p>
        </div>
        <Link to="/ordenes" className="text-sm text-brand-600 hover:underline">Ver tablero →</Link>
      </div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="relative mx-auto sm:mx-0 shrink-0">
          <svg viewBox="0 0 120 120" className="w-32 h-32">
            <circle cx="60" cy="60" r="38" fill="none" stroke="#e2e8f0" strokeWidth="14" />
            {total > 0 && rings.map((s) => {
              if (!s.value) return null
              if (s.frac >= 0.999) {
                return <circle key={s.id} cx="60" cy="60" r="38" fill="none" stroke={s.color} strokeWidth="14" />
              }
              const gap = s.frac > 0.04 ? 0.05 : 0
              return (
                <path
                  key={s.id}
                  d={arcPath(60, 60, 38, s.start + gap / 2, s.end - gap / 2)}
                  fill="none"
                  stroke={s.color}
                  strokeWidth="14"
                  strokeLinecap="round"
                />
              )
            })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xl font-bold text-slate-800 leading-none">{total}</p>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 mt-1">Total</p>
          </div>
        </div>
        <div className="flex-1 grid grid-cols-1 gap-2 min-w-0">
          {slices.map((s) => {
            const pct = total ? Math.round((s.value / total) * 100) : 0
            return (
              <div key={s.id} className="flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.color }} />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2 text-sm">
                    <span className="text-slate-600 truncate">{s.label}</span>
                    <span className="font-semibold tabular-nums text-slate-800">{s.value}</span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
                <span className="text-[11px] text-slate-400 tabular-nums w-8 text-right">{pct}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function AlarmGroup({ title, items, tone }) {
  if (!items?.length) return null
  const box = {
    red: 'border-red-200 bg-red-50 text-red-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
  }[tone]
  return (
    <div className={`rounded-lg border p-3 ${box}`}>
      <h3 className="font-semibold text-sm mb-2">{title} ({items.length})</h3>
      <ul className="space-y-2 text-sm">
        {items.map((o) => (
          <li key={o.id} className="flex justify-between gap-2">
            <span>
              <b>{formatOT(o)}</b>{' '}
              {o.work_description}
              {o.client_name ? ` — ${o.client_name}` : ''}
              {STATUS_NOTE[o.status] ? (
                <span className="ml-1 text-[11px] opacity-70">({STATUS_NOTE[o.status]})</span>
              ) : null}
            </span>
            <span className="font-medium shrink-0">{formatDate(o.estimated_delivery_date)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notifyState, setNotifyState] = useState(notificationPermission())
  const { toast } = useToast()
  const ios = isIosDevice()
  const standalone = isStandalonePwa()
  const kpis = stats?.kpis || {}
  const alarms = stats?.alarms || {}
  const alarmCount = (alarms.overdue?.length || 0) + (alarms.due_today?.length || 0) + (alarms.due_tomorrow?.length || 0)

  useEffect(() => {
    Promise.all([api.getStats(), api.getFinanceTrends()])
      .then(([s, t]) => { setStats(s); setTrends(t) })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }, [toast])

  useEffect(() => {
    if (!stats?.delivery_agenda) return
    notifyDeliveries({
      dueToday: stats.delivery_agenda.due_today || [],
      dueTomorrow: stats.delivery_agenda.due_tomorrow || [],
    })
  }, [stats])

  if (loading) return <Loading />
  if (!stats) return <p className="text-red-600">Error al cargar estadísticas</p>

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Inicio</h1>
        <p className="text-slate-500 text-sm mt-1">Taller al día: alarmas, caja y entregas</p>
      </div>

      {ios && !standalone && (
        <div className="card p-4 border-brand-200 bg-brand-50">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-white text-brand-700 shrink-0">
              <Share size={18} />
            </div>
            <div className="text-sm text-slate-700 min-w-0">
              <p className="font-semibold text-slate-900">Agregar Vehimac al inicio del iPhone</p>
              <p className="mt-1">Tiene que ser <b>Safari</b> (no Chrome). Si no, no aparece la opción.</p>
              <ol className="mt-2 space-y-1 list-decimal list-inside text-slate-600">
                <li>Tocá el botón <b>Compartir</b> (cuadrado con flecha hacia arriba).</li>
                <li>Bajá y tocá <b>Agregar a pantalla de inicio</b>.</li>
                <li>Confirmá <b>Agregar</b>. El ícono V / VEHIMAC queda en el inicio.</li>
              </ol>
            </div>
          </div>
        </div>
      )}

      {notificationsSupported() && notifyState !== 'granted' && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-800">Avisos de entrega</p>
            <p>
              {ios && !standalone
                ? 'Primero agregala al inicio; después activá los avisos desde la app.'
                : 'Activá avisos del celular para enterarte al abrir la app si hay entregas hoy o mañana.'}
            </p>
          </div>
          <button
            type="button"
            className="btn-secondary min-h-[44px]"
            onClick={async () => {
              const perm = await requestNotificationPermission()
              setNotifyState(perm)
              if (perm === 'granted' && stats?.delivery_agenda) {
                notifyDeliveries({
                  dueToday: stats.delivery_agenda.due_today || [],
                  dueTomorrow: stats.delivery_agenda.due_tomorrow || [],
                })
              }
            }}
          >
            <Bell size={16} /> Activar avisos
          </button>
        </div>
      )}

      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Alarmas</h2>
            <p className="text-xs text-slate-500">Solo OTs pendientes (en proceso o para recoger). No se muestran las entregadas.</p>
          </div>
          <Link to="/ordenes?period=overdue" className="text-sm text-brand-700 hover:underline shrink-0">Ver tablero</Link>
        </div>
        {alarmCount === 0 ? (
          <p className="text-sm text-slate-500">No hay OTs atrasadas ni entregas hoy/mañana.</p>
        ) : (
          <div className="space-y-3">
            <AlarmGroup title="Atrasadas" items={alarms.overdue} tone="red" />
            <AlarmGroup title="Entregar hoy" items={alarms.due_today} tone="amber" />
            <AlarmGroup title="Entregar mañana" items={alarms.due_tomorrow} tone="amber" />
          </div>
        )}
      </div>

      <div>
        <h2 className="font-semibold mb-3">KPIs del taller</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard title="Ingresos hoy" value={formatCurrency(kpis.income_today)} icon={Banknote} color="green" />
          <StatCard title="Ingresos semana" value={formatCurrency(kpis.income_week)} icon={TrendingUp} color="green" />
          <StatCard title="Ingresos mes" value={formatCurrency(kpis.income_month)} icon={TrendingUp} color="green" />
          <StatCard title="Gastos mes" value={formatCurrency(kpis.expenses_month)} icon={Banknote} color="red" />
          <StatCard title="Por cobrar" value={formatCurrency(kpis.to_collect)} subtitle="OTs no entregadas" icon={CircleDollarSign} color="amber" />
          <StatCard title="Adelantos del mes" value={formatCurrency(kpis.advances_month)} icon={Banknote} />
          <StatCard title="Ticket promedio" value={formatCurrency(kpis.avg_ticket)} subtitle={`${kpis.delivered_month || 0} OT entregadas este mes`} icon={Wrench} />
          <StatCard
            title="OTs atrasadas"
            value={kpis.overdue_count ?? 0}
            subtitle={kpis.overdue_pct ? `${kpis.overdue_pct}% de las pendientes` : 'Ninguna'}
            icon={Clock}
            color="red"
          />
          <StatCard title="Se entregan hoy" value={kpis.due_today_count ?? 0} icon={Timer} color="amber" />
          <StatCard title="Se entregan mañana" value={kpis.due_tomorrow_count ?? 0} icon={Timer} color="amber" />
          <StatCard title="Órdenes activas" value={stats.active_orders} icon={Wrench} color="amber" />
          <StatCard title="Piezas +7 días" value={kpis.stale_pieces_count ?? stats.stored_pieces_count} icon={Package} color="amber" />
          <StatCard title="Clientes" value={stats.total_clients} icon={Users} />
          <StatCard
            title="QR vs el resto"
            value={formatCurrency(kpis.income_qr_month)}
            subtitle={`Otros ${formatCurrency(kpis.income_other_month)}`}
            icon={CircleDollarSign}
            color="green"
          />
          <StatCard
            title="Proformas → OT"
            value={`${kpis.proformas_conversion_pct ?? 0}%`}
            subtitle={`${kpis.proformas_converted || 0} de ${kpis.proformas_total || 0}`}
            icon={TrendingUp}
          />
          <StatCard
            title="Días promedio"
            value={kpis.avg_days ?? 0}
            subtitle="Ingreso → entrega (mes)"
            icon={Timer}
          />
        </div>
      </div>

      <FinanceChart
        trends={trends}
        title="Ingresos y egresos"
        subtitle="Hoy, esta semana y este mes. Tocá una barra para ver el detalle."
      />

      <AgendaList title="Pasado mañana" items={stats.delivery_agenda?.due_day_after} tone="blue" period="day_after" />
      <AgendaList title="Próxima semana" items={stats.delivery_agenda?.due_next_week} tone="slate" period="next_week" />

      <StatusBreakdown counts={stats.orders_by_status} />

      {stats.stale_stored_pieces?.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-800">Piezas sin recoger (+7 días)</h2>
          </div>
          <ul className="space-y-1 text-sm text-amber-900">
            {stats.stale_stored_pieces.map((o) => (
              <li key={o.id}><b>{formatOT(o)}</b> {o.work_description} {o.client_name && `— ${o.client_name}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
