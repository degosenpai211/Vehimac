import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus, Pencil, Trash2, FileDown, Check, X, ArrowRight } from 'lucide-react'
import Modal from '../components/Modal'
import ClientSearch from '../components/ClientSearch'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import ProformaSheet, { formatBs, lineFigures, sheetTotals } from '../components/ProformaSheet'
import { useToast } from '../components/Toast'
import { api, formatDate } from '../services/api'
import { downloadProformaPdf } from '../services/proformaPdf'

const emptyLine = () => ({
  description: '',
  quantity: '1',
  unit_price: '',
  discount_percent: '',
})

const STATUS = {
  pendiente: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-800' },
  aprobada: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-800' },
  rechazada: { label: 'Rechazada', cls: 'bg-red-100 text-red-800' },
  convertida: { label: 'Convertida', cls: 'bg-slate-200 text-slate-700' },
}

export default function Proformas() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [clientId, setClientId] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([emptyLine()])
  const [saving, setSaving] = useState(false)
  const [preview, setPreview] = useState(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [convertTarget, setConvertTarget] = useState(null)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [registerAdvance, setRegisterAdvance] = useState(false)
  const pdfRef = useRef(null)
  const { toast } = useToast()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()

  const totals = sheetTotals(lines)

  const load = () => {
    setLoading(true)
    api.getProformas()
      .then(setRows)
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  useEffect(() => {
    if (params.get('nueva') === '1') {
      openCreate()
      params.delete('nueva')
      setParams(params, { replace: true })
    }
  }, [])

  const openCreate = () => {
    setEditing(null)
    setClientId('')
    setNotes('')
    setLines([emptyLine()])
    setModalOpen(true)
  }

  const openEdit = (p) => {
    setEditing(p)
    setClientId(p.client_id || '')
    setNotes(p.notes || '')
    setLines(
      (p.pieces || []).length
        ? p.pieces.map((x) => ({
            description: x.description || '',
            quantity: String(x.quantity ?? 1),
            unit_price: String(x.unit_price ?? x.amount ?? ''),
            discount_percent: String(x.discount_percent ?? ''),
          }))
        : [emptyLine()],
    )
    setModalOpen(true)
  }

  const payload = () => ({
    client_id: clientId || null,
    notes: notes || null,
    pieces: lines
      .filter((l) => l.description.trim())
      .map((l) => ({
        description: l.description.trim(),
        quantity: Number(l.quantity) || 1,
        unit_price: Number(l.unit_price) || 0,
        discount_percent: Number(l.discount_percent) || 0,
      })),
  })

  const handleSave = async (e) => {
    e.preventDefault()
    const body = payload()
    if (!body.pieces.length) {
      toast('Agregá al menos una línea con descripción', 'error')
      return
    }
    setSaving(true)
    try {
      if (editing) await api.updateProforma(editing.id, body)
      else await api.createProforma(body)
      toast(editing ? 'Proforma actualizada' : 'Proforma creada', 'success')
      setModalOpen(false)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (p) => {
    if (!confirm(`¿Eliminar proforma Nº ${p.number}?`)) return
    try {
      await api.deleteProforma(p.id)
      toast('Eliminada', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const setStatus = async (p, status) => {
    try {
      await api.updateProforma(p.id, { status })
      toast(`Marcada como ${STATUS[status].label.toLowerCase()}`, 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleConvert = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await api.convertProforma(convertTarget.id, {
        advance_amount: advanceAmount === '' ? null : Number(advanceAmount),
        register_advance: registerAdvance,
      })
      toast(`Convertida a ${res.order?.ot_number != null ? `OT${res.order.ot_number}` : 'OT'}`, 'success')
      setConvertTarget(null)
      load()
      navigate('/ordenes')
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const openPreview = async (p) => {
    try {
      const full = await api.getProforma(p.id)
      setPreview(full)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handlePdf = async () => {
    setPdfBusy(true)
    try {
      await downloadProformaPdf(pdfRef.current, preview?.number)
    } catch (err) {
      toast(err.message || 'No se pudo generar el PDF', 'error')
    } finally {
      setPdfBusy(false)
    }
  }

  const updateLine = (i, field, value) => {
    setLines((prev) => prev.map((l, idx) => (idx === i ? { ...l, [field]: value } : l)))
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Proformas</h1>
          <p className="text-sm text-slate-500">Cotización en PDF. Sin IVA en el papel. Al convertir se crea la OT.</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Crear proforma
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState title="Sin proformas" description="Creá la primera para generar el PDF con el formato de VEHIMAC." />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Nº</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3">Fecha</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const st = STATUS[p.status] || STATUS.pendiente
                return (
                  <tr key={p.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-brand-800">{p.number}</td>
                    <td className="px-4 py-3">{p.client?.name || '—'}</td>
                    <td className="px-4 py-3 font-semibold">{formatBs(p.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${st.cls}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(p.created_at?.slice(0, 10))}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap justify-end gap-1">
                        {/* PDF / descargar: se reactivan al cobrar el diseño original */}
                        <button type="button" className="btn-secondary btn-sm" onClick={() => openPreview(p)}>
                          <FileDown size={14} /> PDF
                        </button>
                        {p.status !== 'convertida' && (
                          <button type="button" className="p-1.5 rounded-md hover:bg-slate-100" onClick={() => openEdit(p)}>
                            <Pencil size={14} />
                          </button>
                        )}
                        {p.status === 'pendiente' && (
                          <button type="button" className="btn-secondary btn-sm" onClick={() => setStatus(p, 'aprobada')}>
                            <Check size={14} /> Aprobar
                          </button>
                        )}
                        {(p.status === 'pendiente' || p.status === 'aprobada') && (
                          <button type="button" className="btn-primary btn-sm" onClick={() => {
                            setConvertTarget(p)
                            setAdvanceAmount('')
                            setRegisterAdvance(false)
                          }}>
                            <ArrowRight size={14} /> A OT
                          </button>
                        )}
                        {p.status === 'pendiente' && (
                          <button type="button" className="p-1.5 rounded-md hover:bg-red-50 text-red-500" onClick={() => setStatus(p, 'rechazada')}>
                            <X size={14} />
                          </button>
                        )}
                        {p.status !== 'convertida' && (
                          <button type="button" className="p-1.5 rounded-md hover:bg-red-50 text-red-500" onClick={() => handleDelete(p)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Editar Nº ${editing.number}` : 'Nueva proforma'} size="xl">
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="label">Trabajo para (cliente)</label>
            <ClientSearch value={clientId} onChange={setClientId} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead>
                <tr className="text-xs text-slate-500 text-left">
                  <th className="pb-2">Descripción</th>
                  <th className="pb-2 w-20">Cant.</th>
                  <th className="pb-2 w-28">P. unitario</th>
                  <th className="pb-2 w-20">% Desc.</th>
                  <th className="pb-2 w-28">Total</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => {
                  const f = lineFigures(l)
                  return (
                    <tr key={i}>
                      <td className="pr-2 pb-2">
                        <input className="input" value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)} />
                      </td>
                      <td className="pr-2 pb-2">
                        <input className="input" type="text" inputMode="decimal" value={l.quantity} onChange={(e) => updateLine(i, 'quantity', e.target.value)} />
                      </td>
                      <td className="pr-2 pb-2">
                        <input className="input" type="text" inputMode="decimal" value={l.unit_price} onChange={(e) => updateLine(i, 'unit_price', e.target.value)} />
                      </td>
                      <td className="pr-2 pb-2">
                        <input className="input" type="text" inputMode="decimal" value={l.discount_percent} onChange={(e) => updateLine(i, 'discount_percent', e.target.value)} />
                      </td>
                      <td className="pb-2 text-right font-medium pt-2">{formatBs(f.gross)}</td>
                      <td className="pb-2">
                        {lines.length > 1 && (
                          <button type="button" className="text-red-500" onClick={() => setLines(lines.filter((_, idx) => idx !== i))}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-secondary btn-sm" onClick={() => setLines([...lines, emptyLine()])}>
            <Plus size={14} /> Línea
          </button>
          <div className="text-sm text-right space-y-0.5">
            <p>Subtotal: <b>{formatBs(totals.gross)}</b></p>
            <p>Descuento: <b>{formatBs(totals.discount)}</b></p>
            <p>Total: <b>{formatBs(totals.net)}</b> <span className="text-slate-400 font-normal">(sin IVA)</span></p>
          </div>
          <div>
            <label className="label">Nota</label>
            <textarea className="input min-h-[72px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={`Proforma Nº ${preview?.number || ''}`} size="xl">
        <div className="flex justify-end mb-3">
          <button type="button" className="btn-primary" disabled={pdfBusy} onClick={handlePdf}>
            <FileDown size={16} /> {pdfBusy ? 'Generando...' : 'Descargar PDF'}
          </button>
        </div>
        <div className="overflow-auto bg-slate-200 p-2 rounded-lg max-h-[70vh]">
          <div className="origin-top-left scale-[0.55] sm:scale-[0.72] lg:scale-[0.85]" style={{ width: '210mm' }}>
            <ProformaSheet proforma={preview} />
          </div>
        </div>
        <div style={{ position: 'fixed', left: 0, top: 0, opacity: 0, pointerEvents: 'none', zIndex: -1 }}>
          <ProformaSheet proforma={preview} sheetRef={pdfRef} />
        </div>
      </Modal>

      <Modal open={!!convertTarget} onClose={() => setConvertTarget(null)} title={`Convertir Nº ${convertTarget?.number || ''} a OT`} size="sm">
        <form onSubmit={handleConvert} className="space-y-3">
          <p className="text-sm text-slate-600">Se crea la orden con el total de la proforma (sin IVA). Solo pedimos el adelanto.</p>
          <p className="text-sm font-semibold">Total: {formatBs(convertTarget?.total_amount)}</p>
          <div>
            <label className="label">Adelanto (Bs)</label>
            <input className="input" type="text" inputMode="decimal" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={registerAdvance} onChange={(e) => setRegisterAdvance(e.target.checked)} />
            Registrar adelanto en finanzas
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => setConvertTarget(null)}>Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Convirtiendo...' : 'Convertir'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
