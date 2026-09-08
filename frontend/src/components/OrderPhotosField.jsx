import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { Camera, Trash2 } from 'lucide-react'
import PhotoLightbox from './PhotoLightbox'
import { useToast } from './Toast'
import { api } from '../services/api'

const MAX = 3

function previewOf(file) {
  return {
    key: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 7)}`,
    file,
    url: URL.createObjectURL(file),
  }
}

const OrderPhotosField = forwardRef(function OrderPhotosField({ orderId, onCountChange }, ref) {
  const [saved, setSaved] = useState([])
  const [pending, setPending] = useState([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [lightbox, setLightbox] = useState(null)
  const inputRef = useRef(null)
  const { toast } = useToast()

  const total = saved.length + pending.length

  const loadSaved = async (id) => {
    if (!id) return
    setLoading(true)
    try {
      const list = await api.getOrderPhotos(id)
      setSaved(list || [])
      onCountChange?.(id, (list || []).length)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (orderId) loadSaved(orderId)
    return () => {
      setPending((prev) => {
        prev.forEach((p) => URL.revokeObjectURL(p.url))
        return []
      })
    }
  }, [orderId])

  useImperativeHandle(ref, () => ({
    flushPending: async (id) => {
      if (!id || !pending.length) return 0
      let ok = 0
      for (const item of pending) {
        try {
          await api.uploadOrderPhoto(id, item.file)
          ok += 1
        } catch (err) {
          toast(err.message || 'No se pudo subir una foto', 'error')
        }
      }
      pending.forEach((p) => URL.revokeObjectURL(p.url))
      setPending([])
      if (ok) onCountChange?.(id, ok)
      return ok
    },
  }), [pending, onCountChange, toast])

  const pick = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (total >= MAX) {
      toast(`Máximo ${MAX} fotos por OT`, 'error')
      return
    }
    if (orderId) {
      setBusy(true)
      try {
        await api.uploadOrderPhoto(orderId, file)
        toast('Foto subida', 'success')
        await loadSaved(orderId)
      } catch (err) {
        toast(err.message, 'error')
      } finally {
        setBusy(false)
      }
      return
    }
    setPending((prev) => [...prev, previewOf(file)])
  }

  const removePending = (key) => {
    setPending((prev) => {
      const hit = prev.find((p) => p.key === key)
      if (hit) URL.revokeObjectURL(hit.url)
      return prev.filter((p) => p.key !== key)
    })
  }

  const removeSaved = async (photo, ev) => {
    ev.stopPropagation()
    if (!orderId) return
    if (!confirm('¿Quitar esta foto?')) return
    setBusy(true)
    try {
      await api.deleteOrderPhoto(orderId, photo.id)
      await loadSaved(orderId)
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setBusy(false)
    }
  }

  const gallery = [
    ...saved.map((p) => ({ ...p, kind: 'saved' })),
    ...pending.map((p) => ({ id: p.key, url: p.url, kind: 'pending', key: p.key })),
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="label mb-0">Fotos (máx. {MAX})</label>
        <button
          type="button"
          className="btn-secondary btn-sm"
          disabled={busy || total >= MAX}
          onClick={() => inputRef.current?.click()}
        >
          <Camera size={14} /> {busy ? 'Subiendo...' : orderId ? 'Subir foto' : 'Sacar / cargar foto'}
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={pick}
        />
      </div>
      <p className="text-xs text-slate-400 mb-2">
        Cámara o galería. Se comprime en el teléfono. {orderId ? 'Podés borrar y volver a subir.' : 'Se suben al crear la orden.'}
      </p>
      {loading ? (
        <p className="text-sm text-slate-400">Cargando fotos...</p>
      ) : gallery.length === 0 ? (
        <p className="text-sm text-slate-400">Sin fotos todavía.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {gallery.map((p, i) => (
            <div key={p.id || p.key} className="relative">
              <button
                type="button"
                onClick={() => setLightbox(i)}
                className="block w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-100"
              >
                <img src={p.url} alt="" className="w-full h-full object-cover" />
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={(e) => (p.kind === 'saved' ? removeSaved(p, e) : (e.stopPropagation(), removePending(p.key)))}
                className="absolute -top-1 -right-1 p-0.5 rounded-full bg-white text-red-500 shadow border border-slate-200 min-h-[28px] min-w-[28px] inline-flex items-center justify-center"
                aria-label="Quitar foto"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <PhotoLightbox
        photos={gallery}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onIndex={setLightbox}
      />
    </div>
  )
})

export default OrderPhotosField
