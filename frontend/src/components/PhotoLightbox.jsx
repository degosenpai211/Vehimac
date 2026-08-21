import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'

export default function PhotoLightbox({ photos, index, onClose, onIndex }) {
  const [touchX, setTouchX] = useState(null)

  useEffect(() => {
    if (index == null) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft') onIndex(Math.max(0, index - 1))
      if (e.key === 'ArrowRight') onIndex(Math.min(photos.length - 1, index + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, photos.length, onClose, onIndex])

  if (index == null || !photos[index]) return null
  const photo = photos[index]

  const prev = () => onIndex(Math.max(0, index - 1))
  const next = () => onIndex(Math.min(photos.length - 1, index + 1))

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/85 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        type="button"
        className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Cerrar"
      >
        <X size={22} />
      </button>
      {index > 0 && (
        <button
          type="button"
          className="absolute left-2 sm:left-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); prev() }}
          aria-label="Anterior"
        >
          <ChevronLeft size={28} />
        </button>
      )}
      {index < photos.length - 1 && (
        <button
          type="button"
          className="absolute right-2 sm:right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
          onClick={(e) => { e.stopPropagation(); next() }}
          aria-label="Siguiente"
        >
          <ChevronRight size={28} />
        </button>
      )}
      <img
        src={photo.url}
        alt=""
        className="max-w-[92vw] max-h-[88vh] object-contain rounded-lg select-none"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchX(e.changedTouches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX == null) return
          const dx = e.changedTouches[0].clientX - touchX
          if (dx > 50) prev()
          if (dx < -50) next()
          setTouchX(null)
        }}
      />
      <p className="absolute bottom-4 text-white/80 text-sm">
        {index + 1} / {photos.length}
      </p>
    </div>
  )
}
