import { useEffect, useState } from 'react'
import { api, formatCurrency } from '../services/api'

const QR_KEY = 'vehimac_qr_next'

export const QR_BANKS = [
  { id: 1, name: 'Banco 1', src: '/qr/banco-1.svg' },
  { id: 2, name: 'Banco 2', src: '/qr/banco-2.svg' },
  { id: 3, name: 'Banco 3', src: '/qr/banco-3.svg' },
]

function nextIndex() {
  return Number(localStorage.getItem(QR_KEY) || 0) % QR_BANKS.length
}

function bumpIndex() {
  const current = nextIndex()
  localStorage.setItem(QR_KEY, String((current + 1) % QR_BANKS.length))
}

function remaining(order) {
  const total = Number(order.total_amount) || Number(order.price_charged) || 0
  const advance = order.advance_recorded ? Number(order.advance_amount) || 0 : 0
  const qr = order.qr_paid ? Number(order.qr_paid_amount) || 0 : 0
  return Math.max(0, Math.round((total - advance - qr) * 100) / 100)
}

export default function PaymentQrModal({ open, order, onClose, onPaid }) {
  const [bank, setBank] = useState(null)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open && order) {
      setBank(QR_BANKS[nextIndex()])
      setAmount(String(remaining(order) || ''))
      setError('')
    }
  }, [open, order])

  if (!open || !order || !bank) return null

  const alreadyPaid = !!order.qr_paid
  const left = remaining(order)

  const handleClose = () => {
    bumpIndex()
    onClose()
  }

  const handleConfirm = async () => {
    const paid = Number(amount)
    if (!paid || paid <= 0) {
      setError('Ingresá el monto que depositó')
      return
    }
    setSaving(true)
    setError('')
    try {
      const updated = await api.confirmQrPayment(order.id, { bank: bank.name, amount: paid })
      bumpIndex()
      onPaid?.(updated)
      onClose()
    } catch (err) {
      setError(err.message || 'No se pudo registrar el pago')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-xl shadow-xl w-full max-w-md p-5">
        <h2 className="text-lg font-semibold mb-1">Comprobante / QR</h2>
        <p className="text-sm text-slate-500 mb-4">
          {order.ot_number ? `OT${order.ot_number}` : 'Orden'} · {bank.name}
        </p>
        <div className="flex justify-center bg-slate-50 rounded-xl p-4 border border-slate-200">
          <img src={bank.src} alt={bank.name} className="w-56 h-56" />
        </div>

        {alreadyPaid ? (
          <p className="text-center mt-4 text-sm font-medium text-emerald-700">
            Ya se confirmó un pago QR de {formatCurrency(order.qr_paid_amount)} ({order.qr_bank})
          </p>
        ) : (
          <>
            <p className="text-center mt-4 text-sm text-slate-600">
              El cliente escanea, pero el sistema no se entera solo. Cuando veas el depósito, confirmá.
            </p>
            <div className="mt-3">
              <label className="label">Monto depositado (Bs.)</label>
              <input
                className="input font-semibold text-right"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.'))}
              />
              <p className="text-xs text-slate-400 mt-1">Saldo pendiente: {formatCurrency(left)}</p>
            </div>
            {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={handleClose} className="btn-secondary flex-1">
            Cerrar
          </button>
          {!alreadyPaid && (
            <button type="button" onClick={handleConfirm} disabled={saving} className="btn-primary flex-1">
              {saving ? 'Guardando...' : 'Ya pagó'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
