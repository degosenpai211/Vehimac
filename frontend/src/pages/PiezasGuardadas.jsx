import { useEffect, useState } from 'react'
import { Search, MessageCircle } from 'lucide-react'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatPhone, openWhatsApp, whatsappUrl, formatOT } from '../services/api'

export default function PiezasGuardadas() {
  const [pieces, setPieces] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    const params = { sort_by: sortBy, sort_dir: sortDir }
    if (search) params.search = search
    api.getStoredPieces(params)
      .then((res) => {
        setPieces(res.items || [])
        setTotal(res.total || 0)
      })
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, sortBy, sortDir])

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Piezas guardadas</h1>
        <p className="text-sm text-slate-500">
          Piezas terminadas que el cliente aún no recogió — {total} en depósito
        </p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input pl-10"
            placeholder="Buscar pieza, cliente, vehículo..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="input sm:w-48" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="updated_at">Última modificación</option>
          <option value="entry_date">Fecha de inicio</option>
          <option value="price_charged">Precio</option>
        </select>
        <select className="input sm:w-36" value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
          <option value="desc">Descendente</option>
          <option value="asc">Ascendente</option>
        </select>
      </div>

      {loading ? <Loading /> : pieces.length === 0 ? (
        <EmptyState message="No hay piezas guardadas. Las órdenes en estado Terminado aparecen aquí." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {pieces.map((p) => {
            const waPhone = p.client?.whatsapp || p.client?.phone
            return (
              <div key={p.id} className="card p-4">
                <div className="flex justify-between items-start mb-1">
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">{formatOT(p)}</span>
                  <span className="text-lg font-bold text-brand-700">{formatCurrency(p.price_charged)}</span>
                </div>
                <h3 className="font-semibold text-sm leading-tight">{p.work_description}</h3>
                {p.part_description && (
                  <p className="text-xs text-slate-500 mt-1">Pieza: {p.part_description}</p>
                )}
                {p.vehicle_type && (
                  <p className="text-xs text-slate-400">{p.vehicle_type}</p>
                )}
                <div className="mt-3 flex justify-between items-center">
                  <span className="text-xs text-slate-400">Inicio: {formatDate(p.entry_date)}</span>
                </div>
                {p.client && (
                  <div className="mt-3 pt-3 border-t border-slate-100">
                    <p className="font-medium text-sm">{p.client.name}</p>
                    <p className="text-xs text-slate-500">{formatPhone(p.client.phone || p.client.whatsapp)}</p>
                    {whatsappUrl(waPhone) ? (
                      <button
                        type="button"
                        onClick={() => openWhatsApp(waPhone, `Hola, te escribo por la ${formatOT(p)} (pieza lista para recoger).`)}
                        className="mt-2 w-full inline-flex items-center justify-center gap-2 min-h-[44px] rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold"
                      >
                        <MessageCircle size={16} /> WhatsApp
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
