import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus, Pencil, Trash2, Search, Copy, QrCode, MessageCircle, Camera, GripVertical } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import Modal from '../components/Modal'
import ClientSearch from '../components/ClientSearch'
import MechanicSearch from '../components/MechanicSearch'
import PaymentQrModal from '../components/PaymentQrModal'
import OrderDetailModal from '../components/OrderDetailModal'
import RescheduleRow from '../components/RescheduleRow'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatOT, computeBilling, whatsappUrl, openWhatsApp } from '../services/api'
import { STATUS_COLUMNS } from '../utils/status'

const emptyPiece = () => ({
  part_name: '',
  description: '',
  amount: '',
  mechanic: '',
  designer: '',
})

const PERIODS = [
  { id: 'all', label: 'Todas' },
  { id: 'today', label: 'Hoy' },
  { id: 'week', label: 'Esta semana' },
  { id: 'overdue', label: 'Atrasadas' },
]

const AGENDA = [
  { id: 'due_today', label: 'Entregar hoy' },
  { id: 'tomorrow', label: 'Mañana' },
  { id: 'day_after', label: 'Pasado' },
  { id: 'next_week', label: 'Próx. semana' },
]

const COLUMN_PAGE = 10

export default function Ordenes() {
  const [board, setBoard] = useState({ en_proceso: [], terminado: [], entregado: [] })
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [clientId, setClientId] = useState('')
  const [clientWhatsapp, setClientWhatsapp] = useState('')
  const [pieces, setPieces] = useState([emptyPiece()])
  const [registerAdvance, setRegisterAdvance] = useState(false)
  const [advanceAmount, setAdvanceAmount] = useState('')
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [entryFrom, setEntryFrom] = useState('')
  const [entryTo, setEntryTo] = useState('')
  const [deliveryFrom, setDeliveryFrom] = useState('')
  const [deliveryTo, setDeliveryTo] = useState('')
  const [period, setPeriod] = useState('all')
  const [billingType, setBillingType] = useState('sin_factura')
  const [qrOrder, setQrOrder] = useState(null)
  const [detailOrder, setDetailOrder] = useState(null)
  const [expandedCols, setExpandedCols] = useState({})
  const { toast } = useToast()
  const [searchParams] = useSearchParams()

  const neto = pieces.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const billing = computeBilling(neto, billingType)
  const total = billing.total
  const suggestedAdvance = total > 0 ? Math.round((total / 2) * 100) / 100 : 0

  const hasDateFilters = !!(search || entryFrom || entryTo || deliveryFrom || deliveryTo)

  const applySuggestedAdvance = () => {
    if (suggestedAdvance > 0) setAdvanceAmount(String(suggestedAdvance))
  }

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (entryFrom) params.entry_from = entryFrom
      if (entryTo) params.entry_to = entryTo
      if (deliveryFrom) params.delivery_from = deliveryFrom
      if (deliveryTo) params.delivery_to = deliveryTo

      const kanban = await api.getKanban(period && period !== 'all' ? { period } : {})
      if (Object.keys(params).length > 0) {
        const filtered = await api.getWorkOrders(params)
        const ids = new Set(filtered.map((o) => o.id))
        const nb = { en_proceso: [], terminado: [], entregado: [] }
        for (const col of Object.keys(nb)) {
          nb[col] = (kanban[col] || []).filter((o) => ids.has(o.id))
        }
        setBoard(nb)
      } else {
        setBoard(kanban)
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [period])

  useEffect(() => {
    const p = searchParams.get('period')
    if (p) setPeriod(p)
  }, [searchParams])

  const openCreate = () => {
    setEditing(null)
    setClientId('')
    setClientWhatsapp('')
    setPieces([emptyPiece()])
    setRegisterAdvance(false)
    setAdvanceAmount('')
    setBillingType('sin_factura')
    setEstimatedDelivery('')
    setModalOpen(true)
  }

  const openEdit = async (order) => {
    try {
      const full = await api.getWorkOrder(order.id)
      setEditing(full)
      setClientId(full.client_id || '')
      setClientWhatsapp(full.client?.whatsapp || full.client?.phone || '')
      setEstimatedDelivery(full.estimated_delivery_date || '')
      setRegisterAdvance(false)
      setAdvanceAmount(full.advance_amount != null ? String(full.advance_amount) : '')
      setBillingType(full.billing_type || 'sin_factura')
      setPieces(
        full.pieces?.length
          ? full.pieces.map((p) => ({
              part_name: p.part_name || '',
              description: p.description || '',
              amount: p.amount,
              mechanic: p.mechanic || '',
              designer: p.designer || '',
            }))
          : [{
              part_name: full.part_description || '',
              description: full.work_description || '',
              amount: full.price_charged,
              mechanic: full.mechanic || '',
              designer: full.designer || '',
            }]
      )
      setModalOpen(true)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const addPiece = () => setPieces([...pieces, emptyPiece()])

  const updatePiece = (idx, field, val) => {
    const next = [...pieces]
    next[idx] = { ...next[idx], [field]: val }
    setPieces(next)
  }

  const removePiece = (idx) => {
    if (pieces.length <= 1) return
    setPieces(pieces.filter((_, i) => i !== idx))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const validPieces = pieces.filter((p) => p.description.trim())
    if (!validPieces.length) {
      toast('Agregá al menos una pieza con descripción', 'error')
      return
    }
    const advance = Number(advanceAmount) || 0
    if (advance < 0 || advance > total) {
      toast('El adelanto debe estar entre 0 y el monto total', 'error')
      return
    }
    setSaving(true)
    try {
      const payload = {
        client_id: clientId || null,
        estimated_delivery_date: estimatedDelivery || null,
        register_advance: registerAdvance,
        billing_type: billingType,
        advance_amount: advance,
        pieces: validPieces.map((p) => ({
          part_name: p.part_name || null,
          description: p.description,
          amount: Number(p.amount) || 0,
          mechanic: p.mechanic || null,
          designer: p.designer || null,
        })),
      }
      if (clientId && clientWhatsapp.trim()) {
        await api.updateClient(clientId, { whatsapp: clientWhatsapp.trim() })
      }
      if (editing) {
        await api.updateWorkOrder(editing.id, payload)
        toast('Orden actualizada', 'success')
      } else {
        const created = await api.createWorkOrder(payload)
        toast(`${formatOT(created)} creada`, 'success')
      }
      setModalOpen(false)
      load()
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta orden?')) return
    try {
      await api.deleteWorkOrder(id)
      toast('Orden eliminada', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const moveStatus = async (orderId, newStatus) => {
    if (newStatus === 'entregado') {
      if (!confirm('¿Marcar como entregado? Se registrará el cobro en finanzas.')) return
    }
    const prev = structuredClone(board)
    const updated = structuredClone(board)
    let moved = null
    for (const col of Object.keys(updated)) {
      const idx = updated[col].findIndex((o) => o.id === orderId)
      if (idx >= 0) {
        moved = { ...updated[col][idx], status: newStatus }
        updated[col].splice(idx, 1)
        break
      }
    }
    if (moved) {
      updated[newStatus] = [moved, ...updated[newStatus]]
      setBoard(updated)
    }
    try {
      await api.updateOrderStatus(orderId, newStatus)
      toast(newStatus === 'entregado' ? 'Entregado — cobro registrado' : 'Estado actualizado', 'success')
    } catch (err) {
      setBoard(prev)
      toast(err.message, 'error')
    }
  }

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return
    const newStatus = destination.droppableId
    if (newStatus === 'entregado' && source.droppableId !== 'entregado') {
      if (!confirm('¿Marcar como entregado? Se registrará el cobro en finanzas.')) return
    }
    const prev = structuredClone(board)
    const sourceCol = [...board[source.droppableId]]
    const destCol = source.droppableId === destination.droppableId ? sourceCol : [...board[destination.droppableId]]
    const [moved] = sourceCol.splice(source.index, 1)
    moved.status = newStatus
    destCol.splice(destination.index, 0, moved)
    setBoard({ ...board, [source.droppableId]: sourceCol, [destination.droppableId]: destCol })
    try {
      await api.updateOrderStatus(draggableId, newStatus)
      if (newStatus === 'entregado') toast('Entregado — cobro registrado', 'success')
    } catch (err) {
      setBoard(prev)
      toast(err.message, 'error')
    }
  }

  const StatusButtons = ({ order }) => {
    const btns = []
    if (order.status === 'en_proceso') {
      btns.push({ label: '→ Terminado', status: 'terminado', cls: 'bg-blue-600 hover:bg-blue-700' })
      btns.push({ label: '→ Entregado', status: 'entregado', cls: 'bg-emerald-600 hover:bg-emerald-700' })
    } else if (order.status === 'terminado') {
      btns.push({ label: '→ Entregado', status: 'entregado', cls: 'bg-emerald-600 hover:bg-emerald-700' })
    }
    if (!btns.length) return null
    return (
      <div className="flex flex-wrap gap-1 mt-3">
        {btns.map((b) => (
          <button
            key={b.status}
            type="button"
            onClick={() => moveStatus(order.id, b.status)}
            className={`flex-1 min-w-[100px] min-h-[44px] text-white text-xs font-semibold py-2 px-2 rounded-lg ${b.cls}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    )
  }

  const OrderCard = ({ order, index, colTheme }) => {
    const waPhone = order.client?.whatsapp || order.client?.phone
    const waText = `Hola, te escribo por la ${formatOT(order)}${order.work_description ? ` (${order.work_description})` : ''}.`
    return (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          style={provided.draggableProps.style}
          className={`bg-white rounded-lg border border-slate-200 shadow-sm mb-3 ${colTheme.cardBorder} ${
            snapshot.isDragging ? 'shadow-xl ring-2 ring-brand-400' : 'hover:shadow-md'
          }`}
        >
          <div className="flex">
            <div
              {...provided.dragHandleProps}
              className="shrink-0 px-1.5 flex items-center text-slate-300 touch-none min-w-[36px]"
              aria-label="Mover orden"
            >
              <GripVertical size={18} />
            </div>
            <div className="flex-1 min-w-0 p-3 pl-1">
          <div className="flex justify-between items-start gap-2 mb-1">
            <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{formatOT(order)}</span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              {whatsappUrl(waPhone) && (
                <button
                  type="button"
                  title="WhatsApp"
                  onMouseDown={(e) => e.stopPropagation()}
                  onTouchStart={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation()
                    openWhatsApp(waPhone, waText)
                  }}
                  className="p-2 rounded-md hover:bg-green-50 text-green-600 min-h-[44px] min-w-[44px] inline-flex items-center justify-center"
                >
                  <MessageCircle size={16} />
                </button>
              )}
              <button type="button" onClick={() => setQrOrder(order)} className="p-2 rounded-md hover:bg-brand-50 text-brand-600 min-h-[44px] min-w-[44px] inline-flex items-center justify-center" title="Generar QR">
                <QrCode size={16} />
              </button>
              <button type="button" onClick={() => openEdit(order)} className="p-2 rounded-md hover:bg-slate-100 text-slate-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
                <Pencil size={16} />
              </button>
              <button type="button" onClick={() => handleDelete(order.id)} className="p-2 rounded-md hover:bg-red-50 text-red-500 min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
          <p className="font-semibold text-sm text-slate-800 leading-snug">{order.work_description}</p>
          {order.pieces?.length > 1 && (
            <p className="text-xs text-slate-500 mt-1">{order.pieces.length} piezas</p>
          )}
          {order.client && <p className="text-sm text-slate-600 mt-1 font-medium">{order.client.name}</p>}
          <div className="flex justify-between items-center py-2 mt-2 border-t border-slate-100 text-sm">
            <span className="text-slate-500 text-xs">
              {order.mechanic || 'Sin mecánico'}
              {order.designer ? ` · ${order.designer}` : ''}
            </span>
            <span className="font-bold">{formatCurrency(order.total_amount || order.price_charged)}</span>
          </div>
          <div className="flex flex-wrap gap-1 mb-1">
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
              order.billing_type === 'con_factura' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'
            }`}>
              {order.billing_type === 'con_factura' ? 'Con factura' : 'Sin factura'}
            </span>
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={(e) => { e.stopPropagation(); setDetailOrder(order) }}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-700 px-1.5 py-2 min-h-[44px] rounded hover:bg-slate-100"
                title="Ver fotos / detalle"
              >
                <Camera size={13} /> {order.photo_count || 0}
              </button>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
            <span>Inicio: {formatDate(order.entry_date)}</span>
            {order.estimated_delivery_date && <span>Entrega: {formatDate(order.estimated_delivery_date)}</span>}
          </div>
          {order.status !== 'entregado' && (
            <RescheduleRow order={order} onDone={load} />
          )}
          {order.advance_recorded && (
            <p className="text-xs text-blue-600 mt-1">Adelanto: {formatCurrency(order.advance_amount)}</p>
          )}
          {order.qr_paid && (
            <p className="text-xs text-emerald-700 mt-1 font-medium">
              Pagó QR {formatCurrency(order.qr_paid_amount)} {order.qr_bank ? `· ${order.qr_bank}` : ''}
            </p>
          )}
          <StatusButtons order={order} />
            </div>
          </div>
        </div>
      )}
    </Draggable>
    )
  }

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de trabajo</h1>
          <p className="text-sm text-slate-500">En proceso → Terminado → Entregado</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={openCreate} className="btn-primary">
            <Plus size={18} /> Nueva orden
          </button>
          <Link to="/proformas?nueva=1" className="btn-secondary">
            Crear proforma
          </Link>
        </div>
      </div>

      <div className="card p-3 space-y-3">
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPeriod(p.id)}
              className={`px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-full text-xs font-semibold border ${
                period === p.id
                  ? 'bg-brand-700 text-white border-brand-700'
                  : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div>
          <p className="text-[11px] font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Entrega (prioridad)</p>
          <div className="flex flex-wrap gap-2">
            {AGENDA.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriod(p.id)}
                className={`px-3 py-2 sm:py-1.5 min-h-[44px] sm:min-h-0 rounded-full text-xs font-semibold border ${
                  period === p.id
                    ? 'bg-amber-600 text-white border-amber-600'
                    : 'bg-amber-50 text-amber-900 border-amber-200 hover:bg-amber-100'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar OT, pieza..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div><label className="label text-xs">Inicio desde</label><input type="date" className="input" value={entryFrom} onChange={(e) => setEntryFrom(e.target.value)} /></div>
          <div><label className="label text-xs">Inicio hasta</label><input type="date" className="input" value={entryTo} onChange={(e) => setEntryTo(e.target.value)} /></div>
          <div><label className="label text-xs">Entrega desde</label><input type="date" className="input" value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} /></div>
          <div><label className="label text-xs">Entrega hasta</label><input type="date" className="input" value={deliveryTo} onChange={(e) => setDeliveryTo(e.target.value)} /></div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn-secondary btn-sm">Aplicar filtros</button>
          {hasDateFilters && (
            <button
              type="button"
              onClick={() => {
                setSearch('')
                setEntryFrom('')
                setEntryTo('')
                setDeliveryFrom('')
                setDeliveryTo('')
                setTimeout(() => load(), 0)
              }}
              className="btn-secondary btn-sm"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STATUS_COLUMNS.map((col) => {
            const all = board[col.id] || []
            const count = all.length
            const showAll = !!expandedCols[col.id]
            const visible = showAll || count <= COLUMN_PAGE ? all : all.slice(0, COLUMN_PAGE)
            return (
              <div key={col.id} className={`rounded-xl flex flex-col min-h-[360px] shadow-md ${col.column}`}>
                <div className={`px-4 py-4 ${col.header}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${col.dot} ring-2 ring-white/50`} />
                      <h2 className="font-bold text-base">{col.title}</h2>
                    </div>
                    <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${col.badge}`}>{count}</span>
                  </div>
                  <p className="text-xs mt-1 opacity-90">{col.subtitle}</p>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-3 flex-1 overflow-y-auto min-h-[200px] ${snapshot.isDraggingOver ? col.dropHover : ''}`}
                    >
                      {count === 0 && !snapshot.isDraggingOver && (
                        <div className="h-24 rounded-lg border-2 border-dashed border-slate-300/60 flex items-center justify-center text-slate-400 text-sm">
                          Sin órdenes
                        </div>
                      )}
                      {(visible).map((order, index) => (
                        <OrderCard key={order.id} order={order} index={index} colTheme={col} />
                      ))}
                      {count > COLUMN_PAGE && !showAll && (
                        <button
                          type="button"
                          onClick={() => setExpandedCols((s) => ({ ...s, [col.id]: true }))}
                          className="w-full text-xs font-semibold py-2 rounded-lg bg-white/70 hover:bg-white text-slate-700"
                        >
                          Ver más ({count - COLUMN_PAGE})
                        </button>
                      )}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            )
          })}
        </div>
      </DragDropContext>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? `${formatOT(editing)} — Editar` : 'Nueva orden'}
        size="xl"
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <ClientSearch
            value={clientId}
            onChange={(id) => {
              setClientId(id)
              if (!id) setClientWhatsapp('')
            }}
            onSelect={(client) => {
              if (!client) {
                setClientWhatsapp('')
                return
              }
              setClientWhatsapp(client.whatsapp || client.phone || '')
            }}
          />
          {clientId && (
            <div>
              <label className="label">WhatsApp del cliente</label>
              <input
                className="input"
                inputMode="tel"
                placeholder="Ej: 70012345"
                value={clientWhatsapp}
                onChange={(e) => setClientWhatsapp(e.target.value)}
              />
              <p className="text-xs text-slate-400 mt-1">
                Se guarda en la ficha del cliente. En la card de la OT aparece el link a WhatsApp.
              </p>
            </div>
          )}

          <div>
            <label className="label">Entrega estimada</label>
            <input type="date" className="input" value={estimatedDelivery} onChange={(e) => setEstimatedDelivery(e.target.value)} />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="label mb-0">Piezas / trabajos</label>
              <button type="button" onClick={addPiece} className="btn-secondary btn-sm">
                <Copy size={14} /> Añadir pieza
              </button>
            </div>
            {pieces.map((piece, idx) => (
              <div key={idx} className="p-3 border border-slate-200 rounded-lg bg-slate-50 space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold text-slate-500">Pieza {idx + 1}</span>
                  {pieces.length > 1 && (
                    <button type="button" onClick={() => removePiece(idx)} className="text-xs text-red-500">Quitar</button>
                  )}
                </div>
                <div className="grid sm:grid-cols-3 gap-2">
                  <input className="input" placeholder="Pieza / parte" value={piece.part_name} onChange={(e) => updatePiece(idx, 'part_name', e.target.value)} />
                  <MechanicSearch value={piece.mechanic} onChange={(val) => updatePiece(idx, 'mechanic', val)} placeholder="Mecánico" role="mechanic" />
                  <MechanicSearch value={piece.designer} onChange={(val) => updatePiece(idx, 'designer', val)} placeholder="Diseñador" role="designer" />
                </div>
                <textarea className="input" required rows={2} placeholder="Descripción del trabajo *" value={piece.description} onChange={(e) => updatePiece(idx, 'description', e.target.value)} />
                <input type="number" min="0" step="0.01" className="input" placeholder="Monto (Bs.)" value={piece.amount} onChange={(e) => updatePiece(idx, 'amount', e.target.value)} />
              </div>
            ))}
          </div>

          <div className="p-4 bg-brand-50 border border-brand-200 rounded-lg space-y-3">
            <div>
              <label className="label">Facturación</label>
              <div className="flex gap-2">
                {[
                  { id: 'sin_factura', label: 'Sin factura' },
                  { id: 'con_factura', label: 'Con factura (+13% IVA)' },
                ].map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={!!editing?.delivery_payment_recorded}
                    onClick={() => setBillingType(opt.id)}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium border ${
                      billingType === opt.id
                        ? 'bg-brand-700 text-white border-brand-700'
                        : 'bg-white text-slate-600 border-slate-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between"><span>Neto</span><span className="font-medium">{formatCurrency(billing.neto)}</span></div>
              <div className="flex justify-between text-slate-600"><span>IVA 13%</span><span>{formatCurrency(billing.iva)}</span></div>
              <div className="flex justify-between pt-1 border-t border-brand-200">
                <span className="font-medium">Total</span>
                <span className="text-xl font-bold text-brand-800">{formatCurrency(billing.total)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label className="label mb-0">Adelanto (Bs.)</label>
                {!editing?.advance_recorded && suggestedAdvance > 0 && (
                  <button
                    type="button"
                    onClick={applySuggestedAdvance}
                    className="text-xs font-medium text-brand-700 hover:text-brand-900 underline"
                  >
                    Usar 50% ({formatCurrency(suggestedAdvance)})
                  </button>
                )}
              </div>
              <input
                type="text"
                inputMode="decimal"
                placeholder="Escribí el monto del adelanto"
                className="input font-semibold"
                value={advanceAmount}
                readOnly={!!editing?.advance_recorded}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9.,]/g, '').replace(',', '.')
                  setAdvanceAmount(val)
                }}
              />
              {editing?.advance_recorded ? (
                <p className="text-xs text-green-700">Adelanto ya registrado en finanzas (no editable)</p>
              ) : (
                <p className="text-xs text-slate-400">Podés escribir cualquier monto hasta el total de la orden</p>
              )}
            </div>
            {!editing?.advance_recorded && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={registerAdvance} onChange={(e) => setRegisterAdvance(e.target.checked)} className="rounded" />
                Registrar adelanto ahora (finanzas + saldo cliente)
              </label>
            )}
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear orden'}
            </button>
          </div>
        </form>
      </Modal>

      <OrderDetailModal
        open={!!detailOrder}
        order={detailOrder}
        onClose={() => setDetailOrder(null)}
        onCountChange={(orderId, count) => {
          setBoard((prev) => {
            const next = { ...prev }
            for (const col of Object.keys(next)) {
              next[col] = next[col].map((o) => (o.id === orderId ? { ...o, photo_count: count } : o))
            }
            return next
          })
        }}
      />
      <PaymentQrModal
        open={!!qrOrder}
        order={qrOrder}
        onClose={() => setQrOrder(null)}
        onPaid={() => {
          setQrOrder(null)
          load()
        }}
      />
    </div>
  )
}
