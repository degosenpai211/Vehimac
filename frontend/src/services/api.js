const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

async function request(path, options = {}) {
  let res
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options,
    })
  } catch {
    throw new ApiError('Sin conexión al servidor. Verificá que el backend esté corriendo.', 0)
  }

  if (res.status === 204) return null
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    const msg = data?.detail || `Error ${res.status}`
    throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status)
  }
  return data
}

export const api = {
  getStats: () => request('/dashboard/stats'),
  getFinanceTrends: () => request('/dashboard/finance-trends'),

  getStoredPieces: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/stored-pieces${q ? `?${q}` : ''}`)
  },

  getClients: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) q.set(k, v)
    })
    const s = q.toString()
    return request(`/clients${s ? `?${s}` : ''}`)
  },
  getClient: (id) => request(`/clients/${id}`),
  createClient: (data) => request('/clients', { method: 'POST', body: JSON.stringify(data) }),
  updateClient: (id, data) => request(`/clients/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteClient: (id) => request(`/clients/${id}`, { method: 'DELETE' }),
  addAuto: (clientId, data) => request(`/clients/${clientId}/autos`, { method: 'POST', body: JSON.stringify(data) }),
  deleteAuto: (clientId, autoId) => request(`/clients/${clientId}/vehicles/${autoId}`, { method: 'DELETE' }),

  getWorkOrders: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/work-orders${q ? `?${q}` : ''}`)
  },
  getKanban: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) q.set(k, v)
    })
    const s = q.toString()
    return request(`/work-orders/kanban${s ? `?${s}` : ''}`)
  },
  getWorkOrder: (id) => request(`/work-orders/${id}`),
  createWorkOrder: (data) => request('/work-orders', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkOrder: (id, data) => request(`/work-orders/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  updateOrderStatus: (id, status) =>
    request(`/work-orders/${id}/status?status=${status}`, { method: 'PATCH' }),
  recordAdvance: (id) => request(`/work-orders/${id}/advance`, { method: 'POST' }),
  confirmQrPayment: (id, data) =>
    request(`/work-orders/${id}/qr-payment`, { method: 'POST', body: JSON.stringify(data) }),
  deleteWorkOrder: (id) => request(`/work-orders/${id}`, { method: 'DELETE' }),
  getOrderPhotos: (id) => request(`/work-orders/${id}/photos`),
  uploadOrderPhoto: async (id, file) => {
    const form = new FormData()
    form.append('file', file)
    let res
    try {
      res = await fetch(`${API_URL}/api/work-orders/${id}/photos`, { method: 'POST', body: form })
    } catch {
      throw new ApiError('Sin conexión al servidor. Verificá que el backend esté corriendo.', 0)
    }
    const data = await res.json().catch(() => null)
    if (!res.ok) {
      const msg = data?.detail || `Error ${res.status}`
      throw new ApiError(typeof msg === 'string' ? msg : JSON.stringify(msg), res.status)
    }
    return data
  },
  deleteOrderPhoto: (orderId, photoId) =>
    request(`/work-orders/${orderId}/photos/${photoId}`, { method: 'DELETE' }),

  getMechanics: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) q.set(k, v)
    })
    const s = q.toString()
    return request(`/mechanics${s ? `?${s}` : ''}`)
  },
  createMechanic: (data) => request('/mechanics', { method: 'POST', body: JSON.stringify(data) }),
  updateMechanic: (id, data) => request(`/mechanics/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  getFinances: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/finances${q ? `?${q}` : ''}`)
  },
  getPeriodSummaries: () => request('/finances/summary/periods'),
  getDailySummary: (date) => request(`/finances/summary/daily${date ? `?target_date=${date}` : ''}`),
  getMonthlySummary: (year, month) => {
    const params = new URLSearchParams()
    if (year) params.set('year', year)
    if (month) params.set('month', month)
    const q = params.toString()
    return request(`/finances/summary/monthly${q ? `?${q}` : ''}`)
  },
  createFinance: (data) => request('/finances', { method: 'POST', body: JSON.stringify(data) }),
  deleteFinance: (id) => request(`/finances/${id}`, { method: 'DELETE' }),
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(amount || 0)
}

export function formatDate(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr + (dateStr.includes('T') ? '' : 'T12:00:00')).toLocaleDateString('es-BO')
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '-'
  return new Date(dateStr).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatPhone(phone) {
  if (!phone) return '-'
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('591') && digits.length >= 11) {
    return `+591 ${digits.slice(3, 5)} ${digits.slice(5, 9)} ${digits.slice(9)}`
  }
  return phone
}

export function whatsappUrl(phone) {
  if (!phone) return null
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  const normalized = digits.startsWith('591') ? digits : `591${digits.replace(/^0/, '')}`
  return `https://wa.me/${normalized}`
}

export function formatOT(order) {
  if (order?.ot_number) return `OT${order.ot_number}`
  return order?.ot_number === 0 ? 'OT0' : '—'
}

export function computeBilling(neto, billingType) {
  const n = Number(neto) || 0
  if (billingType === 'con_factura' && n > 0) {
    const iva = Math.round(n * 0.13 * 100) / 100
    return { neto: n, iva, total: Math.round((n + iva) * 100) / 100 }
  }
  return { neto: n, iva: 0, total: n }
}

export function orderPayable(order) {
  if (!order) return 0
  if (order.total_amount != null && Number(order.total_amount) > 0) return Number(order.total_amount)
  return computeBilling(order.price_charged, order.billing_type).total
}
