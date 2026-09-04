import { useState } from 'react'
import { api } from '../services/api'

export const PLASTIC27_QR = {
  name: 'BNB',
  src: '/qr/bnb-plastic27.jpg',
  product: 'Plastic 27',
}

export default function ProductQrModal({ open, onClose, onPaid }) {
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  if (!open) return null

  const handleClose = () => {
    setAmount('')
    setError('')
    onClose()
  }

  const handleConfirm = async () => {
    const paid = Number(String(amount).replace(',', '.'))
    if (!paid || paid <= 0) {
      setError('Ingresá el monto de la compra')
      return
    }
    setSaving(true)
    setError('')
    try {
      await api.createFinance({
        type: 'gasto',
        description: `Compra ${PLASTIC27_QR.product} (filamento)`,
        amount: paid,
        category: 'Plastic 27',
      })
      onPaid?.()
      handleClose()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-5 max-h-[92vh] overflow-y-auto">
        <h2 className="text-lg font-semibold mb-1">Compra Plastic 27</h2>
        <p className="text-sm text-slate-500 mb-4">{PLASTIC27_QR.name} · costo directo / filamentos</p>
        <div className="flex justify-center bg-white rounded-xl p-2 border border-slate-200">
          <img src={PLASTIC27_QR.src} alt="BNB Plastic 27" className="w-full max-h-[58vh] object-contain" />
        </div>
        <p className="text-center mt-4 text-sm text-slate-600">
          Registrá el monto de la compra de Plastic 27 (filamento). Entra como egreso en el estado de resultados.
        </p>
        <div className="mt-3">
          <label className="label">Monto pagado (Bs.)</label>
          <input
            className="input font-semibold text-right"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
          />
        </div>
        {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button type="button" onClick={handleClose} className="btn-secondary flex-1">Cerrar</button>
          <button type="button" onClick={handleConfirm} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Guardando...' : 'Registrar compra'}
          </button>
        </div>
      </div>
    </div>
  )
}
