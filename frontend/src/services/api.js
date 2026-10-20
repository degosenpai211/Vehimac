import { compressOrderPhoto } from '../utils/compressImage'
import { authService, getAccessToken } from '../auth/authService'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
export const UNAUTHORIZED_EVENT = 'vehimac:unauthorized'

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function authorizationHeader() {
  let token = getAccessToken()
  if (!token) {
    const session = await authService.getSession().catch(() => null)
    token = session?.access_token || ''
  }
  if (!token) return {}
  return { Authorization: `Bearer ${token}` }
}

function raiseIfDenied(status, sentToken) {
  if (status === 401 && sentToken && typeof window !== 'undefined') {
    window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
  }
}

async function parseBody(res) {
  if (res.status === 204) return null
  return res.json().catch(() => null)
}

const NO_CONNECTION = 'No hay conexión. Probá de nuevo.'
const TRY_AGAIN = 'Falló. Reiniciá e intentá otra vez.'
const SIGN_IN_AGAIN = 'Tenés que entrar de nuevo.'
const CHECK_FORM = 'Faltan datos. Revisá lo que cargaste.'

function isTechnical(text) {
  return /supabase|migration|backend|traceback|exception|sql|column|bucket|stack|jwt|token|vite_|service_role|\bapi\b|internal server|syntax|timeout/i.test(text)
}

function errorMessage(data, status) {
  const raw = data?.detail
  const text = typeof raw === 'string' ? raw.trim() : ''
  if (status === 401) return text && !isTechnical(text) ? text : SIGN_IN_AGAIN
  if (status === 403 && text && !isTechnical(text)) return text
  if (status === 422) return CHECK_FORM
  if (!text || isTechnical(text) || status >= 500 || status === 0) return TRY_AGAIN
  return text
}

async function request(path, options = {}, attempt = 0) {
  const auth = await authorizationHeader()
  const sentToken = Boolean(auth.Authorization)
  let res
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...auth, ...options.headers },
    })
  } catch {
    const method = (options.method || 'GET').toUpperCase()
    if (attempt < 1 && (method === 'GET' || method === 'HEAD')) {
      await sleep(400)
      return request(path, options, attempt + 1)
    }
    throw new ApiError(NO_CONNECTION, 0)
  }

  const data = await parseBody(res)
  if (res.status === 401 && sentToken && attempt < 1) {
    const session = await authService.refreshSession().catch(() => null)
    const fresh = session?.access_token || ''
    const sent = auth.Authorization.replace('Bearer ', '')
    if (fresh && fresh !== sent) return request(path, options, attempt + 1)
  }
  if (!res.ok) {
    raiseIfDenied(res.status, sentToken)
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return data
}

async function uploadForm(path, form) {
  const auth = await authorizationHeader()
  let res
  try {
    res = await fetch(`${API_URL}/api${path}`, {
      method: 'POST',
      headers: auth,
      body: form,
    })
  } catch {
    throw new ApiError(NO_CONNECTION, 0)
  }
  const data = await parseBody(res)
  if (!res.ok) {
    raiseIfDenied(res.status, Boolean(auth.Authorization))
    throw new ApiError(errorMessage(data, res.status), res.status)
  }
  return data
}

export const api = {
  me: () => request('/auth/me'),
  authStatus: () => request('/auth/status'),
  bootstrapOwners: (payload) => request('/auth/bootstrap', { method: 'POST', body: JSON.stringify(payload) }),
  listAccessUsers: () => request('/auth/users'),
  inviteAccessUser: (data) => request('/auth/users', { method: 'POST', body: JSON.stringify(data) }),
  updateAccessUser: (id, fields) =>
    request(`/auth/users/${id}`, { method: 'PATCH', body: JSON.stringify(fields) }),
  requestAccess: () => request('/auth/join-requests', { method: 'POST' }),
  listJoinRequests: () => request('/auth/join-requests'),
  approveJoinRequest: (id, data) =>
    request(`/auth/join-requests/${id}/approve`, { method: 'POST', body: JSON.stringify(data) }),
  rejectJoinRequest: (id) =>
    request(`/auth/join-requests/${id}/reject`, { method: 'POST' }),
  getStats: () => request('/dashboard/stats'),
  getFinanceKpis: () => request('/dashboard/finance-kpis'),
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
  getCommissionPieces: () => request('/work-orders/commission-pieces'),
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
    const toUpload = await compressOrderPhoto(file)
    const form = new FormData()
    form.append('file', toUpload)
    return uploadForm(`/work-orders/${id}/photos`, form)
  },
  deleteOrderPhoto: (orderId, photoId) =>
    request(`/work-orders/${orderId}/photos/${photoId}`, { method: 'DELETE' }),

  getProformas: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v != null) q.set(k, v)
    })
    const s = q.toString()
    return request(`/proformas${s ? `?${s}` : ''}`)
  },
  getProforma: (id) => request(`/proformas/${id}`),
  createProforma: (data) => request('/proformas', { method: 'POST', body: JSON.stringify(data) }),
  updateProforma: (id, data) => request(`/proformas/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  convertProforma: (id, data) =>
    request(`/proformas/${id}/convert`, { method: 'POST', body: JSON.stringify(data) }),
  acceptProforma: (id) => request(`/proformas/${id}/accept`, { method: 'POST', body: '{}' }),
  deleteProforma: (id) => request(`/proformas/${id}`, { method: 'DELETE' }),
  uploadProformaPdf: async (id, blob, number) => {
    const form = new FormData()
    form.append('file', blob, `Proforma-${number || 'VEHIMAC'}.pdf`)
    return uploadForm(`/proformas/${id}/pdf`, form)
  },
  getProformaShare: (code) => request(`/p/${encodeURIComponent(code)}`),

  getMechanics: (params = {}) => {
    const q = new URLSearchParams()
    Object.entries(params).forEach(([k, v]) => { if (v !== '' && v != null) q.set(k, v) })
    const s = q.toString()
    return request(`/mechanics${s ? `?${s}` : ''}`)
  },
  getMechanicWorkload: () => request('/mechanics/workload'),
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
  getSalaryBoard: () => request('/finances/salaries'),
  paySalary: (data) => request('/finances/salaries/pay', { method: 'POST', body: JSON.stringify(data) }),
  paySalaryAdvance: (data) => request('/finances/salaries/advance', { method: 'POST', body: JSON.stringify(data) }),
  getProfitLoss: (params = {}) => {
    const q = new URLSearchParams(params).toString()
    return request(`/finances/pl${q ? `?${q}` : ''}`)
  },
  getFinanceSettings: () => request('/finances/settings'),
  updateFinanceSettings: (data) => request('/finances/settings', { method: 'PATCH', body: JSON.stringify(data) }),
  payRent: (which) => request(`/finances/rents/${which}`, { method: 'POST' }),
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

export function whatsappDigits(phone) {
  if (!phone) return null
  const digits = String(phone).replace(/\D/g, '')
  if (!digits) return null
  return digits.startsWith('591') ? digits : `591${digits.replace(/^0/, '')}`
}

const WHATSAPP_WEB_SEND = 'https://web.whatsapp.com/send'

export function whatsappChatUrl(phone, options = {}) {
  const normalized = whatsappDigits(phone)
  if (!normalized) return null
  const text = options.text || ''
  if (options.useWeb) {
    const params = new URLSearchParams({ phone: normalized })
    if (text) params.set('text', text)
    return `${WHATSAPP_WEB_SEND}?${params.toString()}`
  }
  const query = text ? `?text=${encodeURIComponent(text)}` : ''
  return `https://wa.me/${normalized}${query}`
}

function isIosOrInstalledApp() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  const standalone = window.navigator.standalone === true
    || window.matchMedia('(display-mode: standalone)').matches
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  return standalone || ios
}

function shouldOpenWhatsAppWeb() {
  if (typeof navigator === 'undefined' || isIosOrInstalledApp()) return false
  return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '')
}

export function whatsappUrl(phone, text) {
  return whatsappChatUrl(phone, { text, useWeb: shouldOpenWhatsAppWeb() })
}

function openBrowserTab(url) {
  const opened = window.open(url, '_blank')
  if (!opened) return false
  opened.opener = null
  opened.focus()
  return true
}

export function openWhatsApp(phone, text) {
  const digits = whatsappDigits(phone)
  if (!digits) return false
  if (isIosOrInstalledApp()) {
    window.location.href = `whatsapp://send?phone=${digits}${text ? `&text=${encodeURIComponent(text)}` : ''}`
    return true
  }
  const url = whatsappUrl(phone, text)
  if (!url) return false
  return openBrowserTab(url)
}

export function reserveWhatsAppTab() {
  if (!shouldOpenWhatsAppWeb()) return { needed: false, tab: null }
  return { needed: true, tab: window.open('about:blank', '_blank') }
}

export function revealWhatsApp({ tab, phone, text }) {
  const url = whatsappUrl(phone, text)
  if (!url) return false
  if (tab && !tab.closed) {
    tab.location.replace(url)
    tab.focus()
    return true
  }
  return openWhatsApp(phone, text)
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

export function orderRemaining(order) {
  if (!order) return 0
  const advance = order.advance_recorded ? Number(order.advance_amount) || 0 : 0
  const qrPaid = order.qr_paid ? Number(order.qr_paid_amount) || 0 : 0
  const leftover = orderPayable(order) - advance - qrPaid
  if (leftover <= 0) return 0
  return Math.round(leftover * 100) / 100
}
