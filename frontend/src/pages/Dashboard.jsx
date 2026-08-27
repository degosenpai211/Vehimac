import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Users, Wrench, Package, Clock, AlertTriangle, Bell } from 'lucide-react'
import StatCard from '../components/StatCard'
import AgendaList from '../components/AgendaList'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate } from '../services/api'
import { ORDER_STATUS } from '../utils/status'
import {
  isIosDevice,
  isStandalonePwa,
  notificationPermission,
  notificationsSupported,
  notifyDeliveries,
  requestNotificationPermission,
} from '../utils/notifications'

const PERIOD_LABELS = {
  today: 'Hoy',
  '3d': '3 días',
  '7d': 'Semana',
  '30d': 'Mes',
  '90d': '3 meses',
}

export default function Dashboard() {
  const [stats, setStats] = useState(null)
  const [trends, setTrends] = useState(null)
  const [loading, setLoading] = useState(true)
  const [notifyState, setNotifyState] = useState(notificationPermission())
  const { toast } = useToast()

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
        <h1 className="text-2xl font-bold text-slate-900">Panel de control</h1>
        <p className="text-slate-500 text-sm mt-1">Resumen del taller</p>
      </div>

      {notificationsSupported() && notifyState !== 'granted' && (
        <div className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          <div className="text-sm text-slate-600">
            <p className="font-medium text-slate-800">Avisos de entrega</p>
            <p>
              {isIosDevice() && !isStandalonePwa()
                ? 'En iPhone: Compartir → Agregar a pantalla de inicio, y después activá los avisos.'
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

      <AgendaList title="Se entregan hoy" items={stats.delivery_agenda?.due_today} tone="red" period="due_today" />
      <AgendaList title="Se entregan mañana" items={stats.delivery_agenda?.due_tomorrow} tone="amber" period="tomorrow" />
      <AgendaList title="Pasado mañana" items={stats.delivery_agenda?.due_day_after} tone="blue" period="day_after" />
      <AgendaList title="Próxima semana" items={stats.delivery_agenda?.due_next_week} tone="slate" period="next_week" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
        <StatCard title="Clientes" value={stats.total_clients} icon={Users} />
        <StatCard title="Órdenes activas" value={stats.active_orders} icon={Wrench} color="amber" />
        <StatCard title="Piezas guardadas" value={stats.stored_pieces_count} icon={Package} color="blue" />
        <Link to="/piezas-guardadas" className="text-xs text-brand-600 hover:underline self-end pb-2">
          Ver piezas sin recoger →
        </Link>
      </div>

      {trends && (
        <div className="card p-4">
          <h2 className="font-semibold mb-4">Ingresos y gastos comparativos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="text-left p-2">Período</th>
                  <th className="text-right p-2">Ingresos</th>
                  <th className="text-right p-2">Gastos</th>
                  <th className="text-right p-2">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {Object.entries(PERIOD_LABELS).map(([key, label]) => {
                  const row = trends[key]
                  if (!row) return null
                  return (
                    <tr key={key} className="hover:bg-slate-50">
                      <td className="p-2 font-medium">{label}</td>
                      <td className="p-2 text-right text-green-600">{formatCurrency(row.total_ingresos)}</td>
                      <td className="p-2 text-right text-red-600">{formatCurrency(row.total_gastos)}</td>
                      <td className={`p-2 text-right font-semibold ${row.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(row.balance)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">Órdenes por estado</h2>
          <Link to="/ordenes" className="text-sm text-brand-600 hover:underline">Ver tablero →</Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(stats.orders_by_status).map(([status, count]) => (
            <div key={status} className={`rounded-lg border p-3 text-center ${ORDER_STATUS[status]?.color || ''}`}>
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs mt-1">{ORDER_STATUS[status]?.label || status}</p>
            </div>
          ))}
        </div>
      </div>

      {stats.overdue_orders?.length > 0 && (
        <div className="card p-4 border-red-200 bg-red-50">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={18} className="text-red-600" />
            <h2 className="font-semibold text-red-800">Entregas estimadas vencidas (en proceso)</h2>
          </div>
          <ul className="space-y-2 text-sm">
            {stats.overdue_orders.map((o) => (
              <li key={o.id} className="flex justify-between text-red-900">
                <span>{o.work_description} {o.client_name && `— ${o.client_name}`}</span>
                <span className="font-medium shrink-0 ml-2">{formatDate(o.estimated_delivery_date)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {stats.stale_stored_pieces?.length > 0 && (
        <div className="card p-4 border-amber-200 bg-amber-50">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={18} className="text-amber-600" />
            <h2 className="font-semibold text-amber-800">Piezas sin recoger (+7 días)</h2>
          </div>
          <ul className="space-y-1 text-sm text-amber-900">
            {stats.stale_stored_pieces.map((o) => (
              <li key={o.id}>{o.work_description} {o.client_name && `— ${o.client_name}`}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
