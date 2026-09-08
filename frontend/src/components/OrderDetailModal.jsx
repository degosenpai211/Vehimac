import { useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import Modal from './Modal'
import PhotoLightbox from './PhotoLightbox'
import { useToast } from './Toast'
import PieceProcessFields from './PieceProcessFields'
import { api, formatCurrency, formatDate, formatOT, openWhatsApp, whatsappUrl } from '../services/api'

export default function OrderDetailModal({ order, open, onClose, onCountChange }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const { toast } = useToast()

  const loadPhotos = async () => {
    if (!order?.id) return
    setLoading(true)
    try {
      const list = await api.getOrderPhotos(order.id)
      setPhotos(list || [])
      onCountChange?.(order.id, (list || []).length)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && order?.id) loadPhotos()
    if (!open) {
      setPhotos([])
      setLightbox(null)
    }
  }, [open, order?.id])

  if (!order) return null

  return (
    <>
      <Modal open={open} onClose={onClose} title={`${formatOT(order)} — Detalle`} size="lg">
        <div className="space-y-4">
          <div>
            <p className="font-semibold text-slate-800">{order.work_description}</p>
            {order.client && (
              <p className="text-sm text-slate-600 mt-1 font-medium inline-flex items-center gap-2">
                {order.client.name}
                {whatsappUrl(order.client.whatsapp || order.client.phone) && (
                  <button
                    type="button"
                    title="WhatsApp"
                    onClick={() => openWhatsApp(
                      order.client.whatsapp || order.client.phone,
                      `Hola, te escribo por la ${formatOT(order)}.`,
                    )}
                    className="p-2 rounded-md hover:bg-green-50 text-green-600 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                  >
                    <MessageCircle size={16} />
                  </button>
                )}
              </p>
            )}
            <p className="text-sm font-bold mt-1">{formatCurrency(order.total_amount || order.price_charged)}</p>
            <p className="text-xs text-slate-400 mt-1">Inicio: {formatDate(order.entry_date)}</p>
            {order.estimated_delivery_date && (
              <p className="text-xs text-slate-400">Entrega cliente: {formatDate(order.estimated_delivery_date)}</p>
            )}
          </div>

          {(order.pieces || []).map((piece, idx) => (
            <div key={piece.id || idx} className="rounded-lg border border-slate-200 overflow-visible">
              <div className="px-3 py-2 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-500">Pieza {idx + 1}{piece.part_name ? ` · ${piece.part_name}` : ''}</p>
                {piece.description && <p className="text-sm text-slate-700 mt-0.5">{piece.description}</p>}
              </div>
              <div className="p-1">
                <PieceProcessFields process={piece.process} readOnly embedded />
              </div>
            </div>
          ))}

          <div>
            <label className="label mb-0">Fotos</label>
            {loading ? (
              <p className="text-sm text-slate-400 mt-2">Cargando fotos...</p>
            ) : photos.length === 0 ? (
              <p className="text-sm text-slate-400 mt-2">Sin fotos. Se cargan al crear o editar la OT.</p>
            ) : (
              <div className="flex flex-wrap gap-2 mt-2">
                {photos.map((p, i) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setLightbox(i)}
                    className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                  >
                    <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </Modal>
      <PhotoLightbox
        photos={photos}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onIndex={setLightbox}
      />
    </>
  )
}
