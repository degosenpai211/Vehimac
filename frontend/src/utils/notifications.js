const NOTIFY_KEY = 'vehimac_notify_day'
const PERMISSION_ASKED = 'vehimac_notify_asked'

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true
}

export function notificationsSupported() {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function notificationPermission() {
  if (!notificationsSupported()) return 'denied'
  return Notification.permission
}

export async function requestNotificationPermission() {
  if (!notificationsSupported()) return 'denied'
  const result = await Notification.requestPermission()
  localStorage.setItem(PERMISSION_ASKED, '1')
  return result
}

export function hasAskedNotifications() {
  return localStorage.getItem(PERMISSION_ASKED) === '1'
}

function todayKey() {
  const d = new Date()
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`
}

export function notifyDeliveries({ dueToday = [], dueTomorrow = [] }) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (localStorage.getItem(NOTIFY_KEY) === todayKey()) return
  localStorage.setItem(NOTIFY_KEY, todayKey())

  const nToday = dueToday.length
  const nTomorrow = dueTomorrow.length
  if (!nToday && !nTomorrow) return

  const parts = []
  if (nToday) parts.push(`Hoy se entregan ${nToday}`)
  if (nTomorrow) parts.push(`mañana ${nTomorrow}`)
  const body = dueToday.slice(0, 3).map((o) => {
    const ot = o.ot_number != null ? `OT${o.ot_number}` : 'OT'
    return `${ot} ${o.client_name || o.work_description || ''}`.trim()
  }).join(', ')

  try {
    new Notification('Vehimac — entregas', {
      body: body ? `${parts.join(', ')}. ${body}` : parts.join(', '),
      tag: 'vehimac-entregas',
      lang: 'es',
    })
  } catch {
    /* iOS Safari a veces exige service worker; el banner en Inicio alcanza */
  }
}
