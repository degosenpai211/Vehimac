import { useEffect, useState } from 'react'
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd'
import { Plus, Pencil, Trash2, Search } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate } from '../services/api'
import { STATUS_COLUMNS } from '../utils/status'

const emptyForm = {
  client_id: '',
  vehicle_type: '',
  part_description: '',
  work_description: '',
  price_charged: '',
  mechanic: '',
  estimated_delivery_date: '',
}

const NEXT_STATUS = {
  en_proceso: 'terminado',
  terminado: 'entregado',
}

const STATUS_LABELS = {
  en_proceso: '→ Terminado',
  terminado: '→ Entregado',
}

export default function Ordenes() {
  const [board, setBoard] = useState({ en_proceso: [], terminado: [], entregado: [] })
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [search, setSearch] = useState('')
  const [entryFrom, setEntryFrom] = useState('')
  const [entryTo, setEntryTo] = useState('')
  const [deliveryFrom, setDeliveryFrom] = useState('')
  const [deliveryTo, setDeliveryTo] = useState('')
  const { toast } = useToast()

  const load = async () => {
    setLoading(true)
    try {
      const params = {}
      if (search) params.search = search
      if (entryFrom) params.entry_from = entryFrom
      if (entryTo) params.entry_to = entryTo
      if (deliveryFrom) params.delivery_from = deliveryFrom
      if (deliveryTo) params.delivery_to = deliveryTo

      const [kanban, clientRes] = await Promise.all([
        api.getKanban(),
        api.getClients(),
      ])
      setBoard(kanban)
      setClients(clientRes.items || clientRes)

      if (Object.keys(params).length > 0) {
        const filtered = await api.getWorkOrders(params)
        const filteredIds = new Set(filtered.map((o) => o.id))
        const newBoard = { en_proceso: [], terminado: [], entregado: [] }
        for (const col of Object.keys(newBoard)) {
          newBoard[col] = (kanban[col] || []).filter((o) => filteredIds.has(o.id))
        }
        setBoard(newBoard)
      }
    } catch (err) {
      toast(err.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const applyFilters = () => load()

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (order) => {
    setEditing(order)
    setForm({
      client_id: order.client_id || '',
      vehicle_type: order.vehicle_type || '',
      part_description: order.part_description || '',
      work_description: order.work_description,
      price_charged: order.price_charged,
      mechanic: order.mechanic || '',
      estimated_delivery_date: order.estimated_delivery_date || '',
    })
    setModalOpen(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const data = {
        client_id: form.client_id || null,
        vehicle_type: form.vehicle_type || null,
        part_description: form.part_description || null,
        work_description: form.work_description,
        price_charged: Number(form.price_charged) || 0,
        mechanic: form.mechanic || null,
        estimated_delivery_date: form.estimated_delivery_date || null,
      }
      if (editing) {
        await api.updateWorkOrder(editing.id, data)
        toast('Orden actualizada', 'success')
      } else {
        await api.createWorkOrder(data)
        toast('Orden creada', 'success')
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
      if (!confirm('¿Marcar como entregado? Se registrará el ingreso en finanzas automáticamente.')) return
    }

    const prevBoard = structuredClone(board)
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
      if (newStatus === 'entregado') toast('Entregado — ingreso registrado en finanzas', 'success')
      else toast('Estado actualizado', 'success')
    } catch (err) {
      setBoard(prevBoard)
      toast(err.message, 'error')
    }
  }

  const onDragEnd = async (result) => {
    const { source, destination, draggableId } = result
    if (!destination) return
    if (source.droppableId === destination.droppableId && source.index === destination.index) return

    const newStatus = destination.droppableId
    if (newStatus === 'entregado' && source.droppableId !== 'entregado') {
      if (!confirm('¿Marcar como entregado? Se registrará el ingreso en finanzas.')) return
    }

    const prevBoard = structuredClone(board)
    const sourceCol = [...board[source.droppableId]]
    const destCol = source.droppableId === destination.droppableId ? sourceCol : [...board[destination.droppableId]]
    const [moved] = sourceCol.splice(source.index, 1)
    moved.status = newStatus
    destCol.splice(destination.index, 0, moved)
    setBoard({ ...board, [source.droppableId]: sourceCol, [destination.droppableId]: destCol })

    try {
      await api.updateOrderStatus(draggableId, newStatus)
      if (newStatus === 'entregado') toast('Entregado — ingreso registrado', 'success')
    } catch (err) {
      setBoard(prevBoard)
      toast(err.message, 'error')
    }
  }

  const OrderCard = ({ order, index, colTheme }) => (
    <Draggable draggableId={order.id} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={provided.draggableProps.style}
          className={`
            bg-white rounded-lg border border-slate-200 shadow-sm mb-3 p-4
            ${colTheme.cardBorder}
            ${snapshot.isDragging ? 'shadow-xl ring-2 ring-brand-400 rotate-1 scale-[1.02]' : 'hover:shadow-md'}
          `}
        >
          <div className="flex justify-between items-start gap-2 mb-2">
            <p className="font-semibold text-sm text-slate-800 leading-snug break-words flex-1">
              {order.work_description}
            </p>
            <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => openEdit(order)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500">
                <Pencil size={14} />
              </button>
              <button onClick={() => handleDelete(order.id)} className="p-1.5 rounded-md hover:bg-red-50 text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {order.client && (
            <p className="text-sm text-slate-600 mb-1 font-medium">{order.client.name}</p>
          )}
          {order.part_description && (
            <p className="text-xs text-slate-500 mb-2">Pieza: {order.part_description}</p>
          )}
          <div className="flex justify-between items-center py-2 border-t border-slate-100 text-sm">
            <span className="text-slate-500">{order.mechanic || 'Sin asignar'}</span>
            <span className="font-bold text-slate-900">{formatCurrency(order.price_charged)}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
            <span>Inicio: {formatDate(order.entry_date)}</span>
            {order.estimated_delivery_date && (
              <span>Entrega: {formatDate(order.estimated_delivery_date)}</span>
            )}
          </div>
          {NEXT_STATUS[order.status] && (
            <button
              onClick={() => moveStatus(order.id, NEXT_STATUS[order.status])}
              className={`btn-sm w-full mt-3 text-xs font-semibold md:hidden text-white rounded-lg py-2 ${colTheme.badge}`}
            >
              {STATUS_LABELS[order.status]}
            </button>
          )}
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
          <p className="text-sm text-slate-500">En proceso → Terminado (sin recoger) → Entregado</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Nueva orden
        </button>
      </div>

      <div className="card p-3 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2 text-sm">
          <div>
            <label className="label text-xs">Inicio desde</label>
            <input type="date" className="input" value={entryFrom} onChange={(e) => setEntryFrom(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Inicio hasta</label>
            <input type="date" className="input" value={entryTo} onChange={(e) => setEntryTo(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Entrega desde</label>
            <input type="date" className="input" value={deliveryFrom} onChange={(e) => setDeliveryFrom(e.target.value)} />
          </div>
          <div>
            <label className="label text-xs">Entrega hasta</label>
            <input type="date" className="input" value={deliveryTo} onChange={(e) => setDeliveryTo(e.target.value)} />
          </div>
        </div>
        <button onClick={applyFilters} className="btn-secondary btn-sm">Aplicar filtros</button>
      </div>

      <DragDropContext onDragEnd={onDragEnd}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {STATUS_COLUMNS.map((col) => {
            const count = board[col.id]?.length || 0
            return (
              <div
                key={col.id}
                className={`rounded-xl flex flex-col min-h-[360px] overflow-hidden shadow-md ${col.column}`}
              >
                <div className={`px-4 py-4 ${col.header}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-3 h-3 rounded-full ${col.dot} ring-2 ring-white/50`} />
                      <h2 className="font-bold text-base tracking-tight">{col.title}</h2>
                    </div>
                    <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${col.badge}`}>
                      {count}
                    </span>
                  </div>
                  <p className="text-xs mt-1 opacity-90">{col.subtitle}</p>
                  <p className="text-xs mt-0.5 opacity-75">{col.countLabel(count)}</p>
                </div>
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      ref={provided.innerRef}
                      {...provided.droppableProps}
                      className={`p-3 flex-1 overflow-y-auto min-h-[200px] transition-colors ${
                        snapshot.isDraggingOver ? col.dropHover : ''
                      }`}
                    >
                      {count === 0 && !snapshot.isDraggingOver && (
                        <div className="flex items-center justify-center h-24 rounded-lg border-2 border-dashed border-slate-300/60 text-slate-400 text-sm text-center px-4">
                          Arrastrá una orden aquí
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

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar orden' : 'Nueva orden'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Cliente</label>
            <select className="input" value={form.client_id} onChange={(e) => setForm({ ...form, client_id: e.target.value })}>
              <option value="">Sin cliente</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="label">Tipo de vehículo</label>
              <input className="input" value={form.vehicle_type} onChange={(e) => setForm({ ...form, vehicle_type: e.target.value })} />
            </div>
            <div>
              <label className="label">Pieza / Parte</label>
              <input className="input" value={form.part_description} onChange={(e) => setForm({ ...form, part_description: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Descripción del trabajo *</label>
            <textarea className="input" required rows={3} value={form.work_description} onChange={(e) => setForm({ ...form, work_description: e.target.value })} />
          </div>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="label">Precio (Bs.)</label>
              <input type="number" min="0" step="0.01" className="input" value={form.price_charged} onChange={(e) => setForm({ ...form, price_charged: e.target.value })} />
            </div>
            <div>
              <label className="label">Mecánico</label>
              <input className="input" value={form.mechanic} onChange={(e) => setForm({ ...form, mechanic: e.target.value })} />
            </div>
            <div>
              <label className="label">Entrega estimada</label>
              <input type="date" className="input" value={form.estimated_delivery_date} onChange={(e) => setForm({ ...form, estimated_delivery_date: e.target.value })} />
            </div>
          </div>
          {!editing && <p className="text-xs text-slate-400">La fecha de inicio se genera automáticamente.</p>}
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Guardando...' : editing ? 'Guardar' : 'Crear'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
