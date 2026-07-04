import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus, Pencil, Trash2, Search, Copy } from 'lucide-react'
import Modal from '../components/Modal'
import ClientSearch from '../components/ClientSearch'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatOT } from '../services/api'
import { STATUS_COLUMNS } from '../utils/status'

const emptyPiece = () => ({
  part_name: '',
  description: '',
  amount: '',
  mechanic: '',
})

export default function Ordenes() {
  const [board, setBoard] = useState({ en_proceso: [], terminado: [], entregado: [] })
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [clientId, setClientId] = useState('')
  const [pieces, setPieces] = useState([emptyPiece()])
  const [registerAdvance, setRegisterAdvance] = useState(false)
  const [estimatedDelivery, setEstimatedDelivery] = useState('')
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [entryFrom, setEntryFrom] = useState('')
  const [entryTo, setEntryTo] = useState('')
  const [deliveryFrom, setDeliveryFrom] = useState('')
  const [deliveryTo, setDeliveryTo] = useState('')
  const { toast } = useToast()

  const total = pieces.reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const advanceAmount = total > 0 ? total / 2 : 0

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (entryFrom) params.entry_from = entryFrom
      if (entryTo) params.entry_to = entryTo
      if (deliveryFrom) params.delivery_from = deliveryFrom
      if (deliveryTo) params.delivery_to = deliveryTo

      const kanban = await api.getKanban()
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

  useEffect(() => { load() }, [])

  const openCreate = () => {
    setEditing(null)
    setClientId('')
    setPieces([emptyPiece()])
    setRegisterAdvance(false)
    setEstimatedDelivery('')
    setModalOpen(true)
  }

  const openEdit = async (order) => {
    try {
      const full = await api.getWorkOrder(order.id)
      setEditing(full)
      setClientId(full.client_id || '')
      setEstimatedDelivery(full.estimated_delivery_date || '')
      setRegisterAdvance(false)
      setPieces(
        full.pieces?.length
          ? full.pieces.map((p) => ({
              part_name: p.part_name || '',
              description: p.description || '',
              amount: p.amount,
              mechanic: p.mechanic || '',
            }))
          : [{
              part_name: full.part_description || '',
              description: full.work_description || '',
              amount: full.price_charged,
              mechanic: full.mechanic || '',
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
    setSaving(true)
    try {
      const payload = {
        client_id: clientId || null,
        estimated_delivery_date: estimatedDelivery || null,
        register_advance: registerAdvance,
        pieces: validPieces.map((p) => ({
          part_name: p.part_name || null,
          description: p.description,
          amount: Number(p.amount) || 0,
          mechanic: p.mechanic || null,
        })),
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
            className={`flex-1 min-w-[100px] text-white text-xs font-semibold py-2 px-2 rounded-lg ${b.cls}`}
          >
            {b.label}
          </button>
        ))}
      </div>
    )
  }

  const OrderCard = ({ order, index, colTheme }) => (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          className={`bg-white rounded-lg border border-slate-200 shadow-sm mb-3 p-4 ${colTheme.cardBorder} ${
            snapshot.isDragging ? 'shadow-xl ring-2 ring-brand-400' : 'hover:shadow-md'
          }`}
        >
          <div className="flex justify-between items-start gap-2 mb-1">
            <span className="text-xs font-bold text-brand-700 bg-brand-50 px-2 py-0.5 rounded">{formatOT(order)}</span>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openEdit(order)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          <p className="font-semibold text-sm text-slate-800 leading-snug">{order.work_description}</p>
          {order.pieces?.length > 1 && (
            <p className="text-xs text-slate-500 mt-1">{order.pieces.length} piezas</p>
          )}
          {order.client && <p className="text-sm text-slate-600 mt-1 font-medium">{order.client.name}</p>}
          <div className="flex justify-between items-center py-2 mt-2 border-t border-slate-100 text-sm">
            <span className="text-slate-500 text-xs">{order.mechanic || 'Sin asignar'}</span>
            <span className="font-bold">{formatCurrency(order.price_charged)}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 text-xs text-slate-400">
            <span>Inicio: {formatDate(order.entry_date)}</span>
            {order.estimated_delivery_date && <span>Entrega: {formatDate(order.estimated_delivery_date)}</span>}
          </div>
          {order.advance_recorded && (
            <p className="text-xs text-blue-600 mt-1">Adelanto: {formatCurrency(order.advance_amount)}</p>
          )}
          <StatusButtons order={order} />
        </div>
      )}
    </Draggable>
  )

  if (loading) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Órdenes de trabajo</h1>
          <p className="text-sm text-slate-500">En proceso → Terminado → Entregado</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Nueva orden
        </button>
      </div>

      <div className="card p-3 space-y-3">
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
        <button onClick={load} className="btn-secondary btn-sm">Aplicar filtros</button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STATUS_COLUMNS.map((col) => {
            const count = board[col.id]?.length || 0
            return (
              <div key={col.id} className={`rounded-xl flex flex-col min-h-[360px] overflow-hidden shadow-md ${col.column}`}>
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
                      {(board[col.id] || []).map((order, index) => (
                        <OrderCard key={order.id} order={order} index={index} colTheme={col} />
                      ))}
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
          <ClientSearch value={clientId} onChange={setClientId} />

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
                <div className="grid sm:grid-cols-2 gap-2">
                  <input className="input" placeholder="Pieza / parte" value={piece.part_name} onChange={(e) => updatePiece(idx, 'part_name', e.target.value)} />
                  <input className="input" placeholder="Mecánico" value={piece.mechanic} onChange={(e) => updatePiece(idx, 'mechanic', e.target.value)} />
                </div>
                <textarea className="input" required rows={2} placeholder="Descripción del trabajo *" value={piece.description} onChange={(e) => updatePiece(idx, 'description', e.target.value)} />
                <input type="number" min="0" step="0.01" className="input" placeholder="Monto (Bs.)" value={piece.amount} onChange={(e) => updatePiece(idx, 'amount', e.target.value)} />
              </div>
            ))}
          </div>

          <div className="p-4 bg-brand-50 border border-brand-200 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="font-medium">Monto total</span>
              <span className="text-xl font-bold text-brand-800">{formatCurrency(total)}</span>
            </div>
            <div className="flex justify-between text-sm text-slate-600">
              <span>Adelanto 50%</span>
              <span className="font-semibold">{formatCurrency(advanceAmount)}</span>
            </div>
            {!editing?.advance_recorded && (
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={registerAdvance} onChange={(e) => setRegisterAdvance(e.target.checked)} className="rounded" />
                Registrar adelanto ahora (finanzas + saldo cliente)
              </label>
            )}
            {editing?.advance_recorded && (
              <p className="text-xs text-green-700">Adelanto ya registrado</p>
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
    </div>
  )
}
