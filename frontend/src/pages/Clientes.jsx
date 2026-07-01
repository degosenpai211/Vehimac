import { useEffect, useState } from 'react'
import { Plus, Search, Phone, MessageCircle, Pencil, Trash2, Car, ExternalLink } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatDateTime, formatPhone, whatsappUrl } from '../services/api'
import { ORDER_STATUS, PAYMENT_METHODS } from '../utils/status'

const emptyForm = {
  name: '', phone: '', whatsapp: '', balance: '', payment_method: '', notes: '', vehicle: '',
}

export default function Clientes() {
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [hasStored, setHasStored] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [detailOpen, setDetailOpen] = useState(false)
  const [selected, setSelected] = useState(null)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const { toast } = useToast()

  const load = () => {
    setLoading(true)
    const params = { sort_by: sortBy, sort_dir: sortDir }
    if (search) params.search = search
    if (hasStored === 'yes') params.has_stored_pieces = true
    if (hasStored === 'no') params.has_stored_pieces = false

    api.getClients(params)
      .then((res) => setClients(res.items || res))
      .catch((err) => toast(err.message, 'error'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [search, sortBy, sortDir, hasStored])

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (c) => {
    setEditing(c)
    setForm({
      name: c.name,
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      balance: c.balance ?? '',
      payment_method: c.payment_method || '',
      notes: c.notes || '',
      vehicle: '',
    })
    setModalOpen(true)
  }

  const openDetail = async (c) => {
    try {
      const full = await api.getClient(c.id)
      setSelected(full)
      setDetailOpen(true)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const balance = Number(form.balance) || 0
      if (balance > 0) {
        toast('No se permite fiado. El saldo solo puede ser 0 o negativo (adelanto).', 'error')
        setSaving(false)
        return
      }
      const data = {
        name: form.name,
        phone: form.phone || null,
        whatsapp: form.whatsapp || form.phone || null,
        balance,
        payment_method: form.payment_method || null,
        notes: form.notes || null,
      }
      if (editing) {
        await api.updateClient(editing.id, data)
        toast('Cliente actualizado', 'success')
      } else {
        const vehicles = form.vehicle ? [{ make: form.vehicle }] : []
        await api.createClient({ ...data, vehicles })
        toast('Cliente creado', 'success')
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
    if (!confirm('¿Eliminar este cliente?')) return
    try {
      await api.deleteClient(id)
      toast('Cliente eliminado', 'success')
      load()
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const balanceLabel = (balance) => {
    const b = Number(balance)
    if (b < 0) return { text: `Adelantó ${formatCurrency(Math.abs(b))}`, class: 'text-blue-600' }
    return { text: 'Al día', class: 'text-slate-500' }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-slate-500">Contactos y piezas pendientes de recoger</p>
        </div>
        <button onClick={openCreate} className="btn-primary">
          <Plus size={18} /> Nuevo cliente
        </button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-44" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Nombre</option>
          <option value="updated_at">Última modificación</option>
          <option value="balance_updated_at">Saldo modificado</option>
          <option value="created_at">Fecha de alta</option>
        </select>
        <select className="input sm:w-32" value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
          <option value="asc">Ascendente</option>
          <option value="desc">Descendente</option>
        </select>
        <select className="input sm:w-44" value={hasStored} onChange={(e) => setHasStored(e.target.value)}>
          <option value="">Todas las piezas</option>
          <option value="yes">Con piezas sin recoger</option>
          <option value="no">Sin piezas guardadas</option>
        </select>
      </div>

      {loading ? <Loading /> : clients.length === 0 ? (
        <EmptyState message="No hay clientes" action={<button onClick={openCreate} className="btn-primary">Agregar cliente</button>} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const wa = whatsappUrl(c.whatsapp || c.phone)
            const bal = balanceLabel(c.balance)
            return (
              <div key={c.id} className="card p-4 hover:shadow-md cursor-pointer" onClick={() => openDetail(c)}>
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{c.name}</h3>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {wa && (
                      <a href={wa} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-green-50 text-green-600">
                        <MessageCircle size={15} />
                      </a>
                    )}
                    <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-slate-100 text-slate-500">
                      <Pencil size={15} />
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-red-50 text-red-500">
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
                <div className="mt-2 space-y-1 text-sm text-slate-500">
                  {c.phone && <p className="flex items-center gap-1.5"><Phone size={14} /> {formatPhone(c.phone)}</p>}
                  {c.stored_pieces_count > 0 && (
                    <p className="text-amber-600 font-medium">{c.stored_pieces_count} pieza(s) sin recoger</p>
                  )}
                </div>
                <div className="mt-3 flex justify-between text-sm">
                  <span className={bal.class}>{bal.text}</span>
                  {c.balance_updated_at && (
                    <span className="text-xs text-slate-400">Saldo: {formatDateTime(c.balance_updated_at)}</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Nombre *</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Teléfono (+591)</label>
              <input className="input" placeholder="7XXXXXXX" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="label">WhatsApp</label>
              <input className="input" placeholder="7XXXXXXX" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Adelanto (Bs., negativo)</label>
              <input type="number" max="0" step="0.01" className="input" placeholder="0" value={form.balance} onChange={(e) => setForm({ ...form, balance: e.target.value })} />
              <p className="text-xs text-slate-400 mt-1">0 = al día. Negativo = adelantó. No se permite fiado.</p>
            </div>
            <div>
              <label className="label">Forma de pago</label>
              <select className="input" value={form.payment_method} onChange={(e) => setForm({ ...form, payment_method: e.target.value })}>
                <option value="">—</option>
                {Object.entries(PAYMENT_METHODS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
          </div>
          {!editing && (
            <div>
              <label className="label">Vehículo (opcional)</label>
              <input className="input" value={form.vehicle} onChange={(e) => setForm({ ...form, vehicle: e.target.value })} />
            </div>
          )}
          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={selected?.name || 'Cliente'} size="lg">
        {selected && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3 text-sm">
              <div><span className="text-slate-500">Teléfono:</span> {formatPhone(selected.phone)}</div>
              <div>
                <span className="text-slate-500">WhatsApp:</span>{' '}
                {whatsappUrl(selected.whatsapp || selected.phone) ? (
                  <a href={whatsappUrl(selected.whatsapp || selected.phone)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline inline-flex items-center gap-1">
                    {formatPhone(selected.whatsapp || selected.phone)} <ExternalLink size={12} />
                  </a>
                ) : '-'}
              </div>
              <div><span className="text-slate-500">Saldo:</span> <span className={balanceLabel(selected.balance).class}>{balanceLabel(selected.balance).text}</span></div>
              {selected.payment_method && (
                <div><span className="text-slate-500">Pago:</span> {PAYMENT_METHODS[selected.payment_method] || selected.payment_method}</div>
              )}
              {selected.balance_updated_at && (
                <div className="sm:col-span-2 text-slate-400">Saldo modificado: {formatDateTime(selected.balance_updated_at)}</div>
              )}
            </div>

            {selected.stored_pieces_count > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                Tiene <strong>{selected.stored_pieces_count}</strong> pieza(s) terminada(s) sin recoger.
              </div>
            )}

            {selected.vehicles?.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Vehículos</h3>
                <ul className="space-y-1 text-sm">
                  {selected.vehicles.map((v) => (
                    <li key={v.id} className="flex items-center gap-2 p-2 bg-slate-50 rounded">
                      <Car size={14} />
                      {[v.make, v.model, v.year, v.plate].filter(Boolean).join(' · ') || 'Sin detalles'}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h3 className="font-medium mb-2">Historial de órdenes</h3>
              <ul className="space-y-2">
                {(selected.work_orders || []).map((o) => (
                  <li key={o.id} className="p-3 bg-slate-50 rounded-lg text-sm">
                    <div className="flex justify-between gap-2">
                      <p className="font-medium">{o.work_description}</p>
                      <span className={`text-xs px-2 py-0.5 rounded border shrink-0 ${ORDER_STATUS[o.status]?.color}`}>
                        {ORDER_STATUS[o.status]?.label}
                      </span>
                    </div>
                    <div className="flex justify-between mt-1 text-slate-500">
                      <span>{formatDate(o.entry_date)}</span>
                      <span className="font-medium">{formatCurrency(o.price_charged)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
