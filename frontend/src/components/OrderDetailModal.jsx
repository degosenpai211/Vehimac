import { useEffect, useRef, useState } from 'react'
import { Camera, Trash2, MessageCircle } from 'lucide-react'
import Modal from './Modal'
import PhotoLightbox from './PhotoLightbox'
import { useToast } from './Toast'
import { api, formatCurrency, formatDate, formatOT, openWhatsApp, whatsappUrl } from '../services/api'

export default function OrderDetailModal({ order, open, onClose, onCountChange }) {
  const [photos, setPhotos] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const inputRef = useRef(null)
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

  const handleUpload = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (photos.length >= 3) {
      toast('Máximo 3 fotos por OT', 'error')
      return
    }
    setUploading(true)
    try {
      await api.uploadOrderPhoto(order.id, file)
      toast('Foto subida', 'success')
      await loadPhotos()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (photo, ev) => {
    ev.stopPropagation()
    if (!confirm('¿Quitar esta foto?')) return
    try {
      await api.deleteOrderPhoto(order.id, photo.id)
      await loadPhotos()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

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
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">Fotos (máx. 3)</label>
              <button
                type="button"
                className="btn-secondary btn-sm"
                disabled={uploading || photos.length >= 3}
                onClick={() => inputRef.current?.click()}
              >
                <Camera size={14} /> {uploading ? 'Subiendo...' : 'Subir foto'}
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="hidden"
                onChange={handleUpload}
              />
            </div>
            <p className="text-xs text-slate-400 mb-2">Desde el celular se abre la cámara o la galería. Jpg/png/webp, hasta 5 MB.</p>
            {loading ? (
              <p className="text-sm text-slate-400">Cargando fotos...</p>
            ) : photos.length === 0 ? (
              <p className="text-sm text-slate-400">Sin fotos todavía.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {photos.map((p, i) => (
                  <div key={p.id} className="relative">
                    <button
                      type="button"
                      onClick={() => setLightbox(i)}
                      className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
                    >
                      <img src={p.url} alt="" className="w-full h-full object-cover" loading="lazy" />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => handleDelete(p, e)}
                      className="absolute -top-1 -right-1 p-0.5 rounded-full bg-white text-red-500 shadow border border-slate-200"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
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
