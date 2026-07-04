import { useEffect, useState } from 'react'
import { Plus, Search, Phone, MessageCircle, Pencil, Trash2, Car, ExternalLink } from 'lucide-react'
import Modal from '../components/Modal'
import Loading from '../components/Loading'
import EmptyState from '../components/EmptyState'
import { useToast } from '../components/Toast'
import { api, formatCurrency, formatDate, formatDateTime, formatPhone, whatsappUrl, formatOT } from '../services/api'
import { ORDER_STATUS } from '../utils/status'

const emptyAuto = () => ({ make: '', model: '', year: '' })

const emptyForm = {
  name: '', phone: '', whatsapp: '', notes: '', autos: [emptyAuto()],
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
    const autos = (c.autos || c.vehicles || []).map((a) => ({
      make: a.make || '', model: a.model || '', year: a.year || '',
    }))
    setForm({
      name: c.name,
      phone: c.phone || '',
      whatsapp: c.whatsapp || '',
      notes: c.notes || '',
      autos: autos.length ? autos : [emptyAuto()],
    })
    setModalOpen(true)
  }

  const openDetail = async (c) => {
    try {
      setSelected(await api.getClient(c.id))
      setDetailOpen(true)
    } catch (err) {
      toast(err.message, 'error')
    }
  }

  const addAuto = () => setForm({ ...form, autos: [...form.autos, emptyAuto()] })

  const updateAuto = (idx, field, val) => {
    const autos = [...form.autos]
    autos[idx] = { ...autos[idx], [field]: val }
    setForm({ ...form, autos })
  }

  const removeAuto = (idx) => {
    if (form.autos.length <= 1) return
    setForm({ ...form, autos: form.autos.filter((_, i) => i !== idx) })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const autos = form.autos
        .filter((a) => a.make || a.model || a.year)
        .map((a) => ({
          make: a.make || null,
          model: a.model || null,
          year: a.year ? Number(a.year) : null,
        }))
      const data = {
        name: form.name,
        phone: form.phone || null,
        whatsapp: form.whatsapp || form.phone || null,
        notes: form.notes || null,
      }
      if (editing) {
        await api.updateClient(editing.id, data)
        for (const old of editing.autos || editing.vehicles || []) {
          await api.deleteAuto(editing.id, old.id)
        }
        for (const a of autos) {
          await api.addAuto(editing.id, a)
        }
        toast('Cliente actualizado', 'success')
      } else {
        await api.createClient({ ...data, autos })
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
          <p className="text-sm text-slate-500">Nombre, contacto y autos</p>
        </div>
        <button onClick={openCreate} className="btn-primary"><Plus size={18} /> Nuevo cliente</button>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className="input pl-10" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <select className="input sm:w-44" value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="name">Nombre</option>
          <option value="updated_at">Última modificación</option>
          <option value="created_at">Fecha de alta</option>
        </select>
        <select className="input sm:w-32" value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
          <option value="asc">A → Z</option>
          <option value="desc">Z → A</option>
        </select>
        <select className="input sm:w-44" value={hasStored} onChange={(e) => setHasStored(e.target.value)}>
          <option value="">Todos</option>
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
            const autos = c.autos || c.vehicles || []
            return (
              <div key={c.id} className="card p-4 hover:shadow-md cursor-pointer" onClick={() => openDetail(c)}>
                <div className="flex justify-between items-start">
                  <h3 className="font-semibold">{c.name}</h3>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="p-1 rounded hover:bg-green-50 text-green-600"><MessageCircle size={15} /></a>}
                    <button onClick={() => openEdit(c)} className="p-1 rounded hover:bg-slate-100"><Pencil size={15} /></button>
                    <button onClick={() => handleDelete(c.id)} className="p-1 rounded hover:bg-red-50 text-red-500"><Trash2 size={15} /></button>
                  </div>
                </div>
                {c.phone && <p className="text-sm text-slate-500 mt-1 flex items-center gap-1"><Phone size={14} /> {formatPhone(c.phone)}</p>}
                {autos.length > 0 && (
                  <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                    <Car size={14} /> {autos.map((a) => [a.make, a.model, a.year].filter(Boolean).join(' ')).join(' · ')}
                  </p>
                )}
                <div className="mt-3 flex justify-between text-sm">
                  {c.stored_pieces_count > 0 && <span className="text-amber-600 font-medium">{c.stored_pieces_count} sin recoger</span>}
                  <span className={balanceLabel(c.balance).class}>{balanceLabel(c.balance).text}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Editar cliente' : 'Nuevo cliente'} size="lg">
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
              <input className="input" value={form.whatsapp} onChange={(e) => setForm({ ...form, whatsapp: e.target.value })} />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="label mb-0">Autos</label>
              <button type="button" onClick={addAuto} className="btn-secondary btn-sm"><Plus size={14} /> Añadir auto</button>
            </div>
            {form.autos.map((auto, idx) => (
              <div key={idx} className="grid grid-cols-3 gap-2 mb-2 p-2 bg-slate-50 rounded-lg border">
                <input className="input" placeholder="Marca" value={auto.make} onChange={(e) => updateAuto(idx, 'make', e.target.value)} />
                <input className="input" placeholder="Modelo" value={auto.model} onChange={(e) => updateAuto(idx, 'model', e.target.value)} />
                <div className="flex gap-1">
                  <input className="input" placeholder="Año" type="number" value={auto.year} onChange={(e) => updateAuto(idx, 'year', e.target.value)} />
                  {form.autos.length > 1 && (
                    <button type="button" onClick={() => removeAuto(idx)} className="text-red-500 px-2">×</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div>
            <label className="label">Notas</label>
            <textarea className="input" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setModalOpen(false)} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={saving} className="btn-primary">{saving ? 'Guardando...' : 'Guardar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={detailOpen} onClose={() => setDetailOpen(false)} title={selected?.name || 'Cliente'} size="lg">
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="grid sm:grid-cols-2 gap-2">
              <div>Tel: {formatPhone(selected.phone)}</div>
              <div>
                WhatsApp:{' '}
                {whatsappUrl(selected.whatsapp || selected.phone) ? (
                  <a href={whatsappUrl(selected.whatsapp || selected.phone)} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline inline-flex items-center gap-1">
                    {formatPhone(selected.whatsapp || selected.phone)} <ExternalLink size={12} />
                  </a>
                ) : '-'}
              </div>
              <div>Saldo: <span className={balanceLabel(selected.balance).class}>{balanceLabel(selected.balance).text}</span></div>
            </div>
            {(selected.autos || selected.vehicles)?.length > 0 && (
              <div>
                <h3 className="font-medium mb-2">Autos</h3>
                <ul className="space-y-1">
                  {(selected.autos || selected.vehicles).map((a) => (
                    <li key={a.id} className="p-2 bg-slate-50 rounded flex items-center gap-2">
                      <Car size={14} /> {[a.make, a.model, a.year].filter(Boolean).join(' · ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {selected.stored_pieces_count > 0 && (
              <p className="p-2 bg-amber-50 text-amber-800 rounded">{selected.stored_pieces_count} pieza(s) sin recoger</p>
            )}
            <div>
              <h3 className="font-medium mb-2">Órdenes</h3>
              <ul className="space-y-2">
                {(selected.work_orders || []).map((o) => (
                  <li key={o.id} className="p-3 bg-slate-50 rounded-lg">
                    <div className="flex justify-between gap-2">
                      <span className="font-bold text-brand-700">{formatOT(o)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded border ${ORDER_STATUS[o.status]?.color}`}>{ORDER_STATUS[o.status]?.label}</span>
                    </div>
                    <p className="mt-1">{o.work_description}</p>
                    <div className="flex justify-between mt-1 text-slate-500">
                      <span>{formatDate(o.entry_date)}</span>
                      <span>{formatCurrency(o.price_charged)}</span>
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
