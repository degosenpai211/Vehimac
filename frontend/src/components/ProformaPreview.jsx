import { useEffect, useRef, useState } from 'react'
import ProformaSheet from './ProformaSheet'

export default function ProformaPreview({ proforma }) {
  const wrapRef = useRef(null)
  const [scale, setScale] = useState(1)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const fit = () => {
      const pageW = 210 * (96 / 25.4)
      const next = Math.min(1, Math.max(0.42, (el.clientWidth - 8) / pageW))
      setScale(next)
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [proforma])

  const pageW = 210 * (96 / 25.4)
  const pageH = 297 * (96 / 25.4)

  return (
    <div ref={wrapRef} className="overflow-auto bg-slate-200 rounded-lg p-2 sm:p-3 max-h-[min(72vh,72dvh)]">
      <div className="mx-auto bg-white shadow-md" style={{ width: pageW * scale, height: pageH * scale }}>
        <div style={{ width: pageW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <ProformaSheet proforma={proforma} />
        </div>
      </div>
    </div>
  )
}
