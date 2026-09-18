import Shepherd from 'shepherd.js'
import 'shepherd.js/dist/css/shepherd.css'
import './vehimac-tour.css'

let activeTour = null

function isDesktop() {
  return window.matchMedia('(min-width: 1024px)').matches
}

function visibleEl(selector) {
  return [...document.querySelectorAll(selector)].find((el) => {
    const r = el.getBoundingClientRect()
    return r.width > 0 && r.height > 0 && r.right > 8 && r.left < window.innerWidth - 8
  }) || document.querySelector(selector)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function waitFor(selector, timeout = 10000) {
  return new Promise((resolve) => {
    const started = Date.now()
    const tick = () => {
      if (document.querySelector(selector)) return resolve(true)
      if (Date.now() - started > timeout) return resolve(false)
      setTimeout(tick, 50)
    }
    tick()
  })
}

async function goTo(name) {
  const path = name === 'inicio' ? '/' : `/${name}`
  if (window.location.pathname === path) return
  if (typeof window.__vehimacTourGo === 'function') {
    window.__vehimacTourGo(path)
  } else {
    visibleEl(`[data-tour="nav-${name}"]`)?.click()
  }
  await sleep(80)
}

function closeModal() {
  document.querySelector('[data-tour="modal-close"]')?.click()
}

function buttons(tour, { first = false, last = false } = {}) {
  return [
    first
      ? { text: 'Saltar', classes: 'shepherd-button-secondary', action: () => tour.cancel() }
      : { text: 'Atrás', classes: 'shepherd-button-secondary', action: () => tour.back() },
    {
      text: last ? 'Listo' : 'Siguiente',
      action: () => (last ? tour.complete() : tour.next()),
    },
  ]
}

export function startAppTour() {
  if (activeTour) {
    activeTour.cancel()
    activeTour = null
  }

  const desktop = isDesktop()
  const tour = new Shepherd.Tour({
    tourName: 'vehimac-prueba',
    useModalOverlay: true,
    keyboardNavigation: true,
    defaultStepOptions: {
      classes: 'vehimac-tour',
      scrollTo: { behavior: 'smooth', block: 'center' },
      cancelIcon: { enabled: true, label: 'Cerrar' },
      modalOverlayOpeningPadding: 8,
      modalOverlayOpeningRadius: 10,
      canClickTarget: false,
      skipMissingElement: false,
    },
  })

  tour.addStep({
    id: 'bienvenida',
    title: 'Inicio',
    text: 'Acá ves el taller al día. En un minuto recorremos lo que más se usa: avisos, OT, proforma, WhatsApp y clientes.',
    attachTo: { element: () => visibleEl('[data-tour="inicio-title"]'), on: 'bottom' },
    buttons: buttons(tour, { first: true }),
  })

  tour.addStep({
    id: 'avisos',
    title: 'Activar avisos',
    text: 'Tocá <b>Activar avisos</b>. El celular pide permiso. Después, las entregas de hoy y mañana salen como notificacón (las mismas que ves en Alarmas).',
    attachTo: { element: () => visibleEl('[data-tour="activar-avisos"]'), on: 'bottom' },
    canClickTarget: true,
    buttons: buttons(tour),
  })

  tour.addStep({
    id: 'alarmas',
    title: 'Alarmas',
    text: 'OTs atrasadas o para entregar hoy/mañana. Si actvaste avisos, eso mismo te llega al abrir la app.',
    attachTo: { element: () => visibleEl('[data-tour="alarmas"]'), on: 'bottom' },
    buttons: buttons(tour),
  })

  tour.addStep({
    id: 'ordenes',
    title: 'Órdenes de trabajo',
    text: 'El tablero: En proceso → Terminado → Entregado. El trabajo del día sale de <b>Nueva orden</b>.',
    attachTo: { element: () => visibleEl('[data-tour="nueva-orden"]'), on: 'bottom' },
    beforeShowPromise: async () => {
      closeModal()
      await goTo('ordenes')
      await waitFor('[data-tour="nueva-orden"]')
    },
    buttons: buttons(tour),
  })

  tour.addStep({
    id: 'ot-form',
    title: 'Qué se carga en la OT',
    text: 'Buscá el cliente o crealo ahí mismo (nombre + WhatsApp). Ponés fecha de entga, las piezas con descripción y monto, y guardá. El auto y las notas se pueden compltar después en Clientes.',
    attachTo: { element: () => visibleEl('[data-tour="ot-form"]'), on: desktop ? 'right' : 'top' },
    beforeShowPromise: async () => {
      await goTo('ordenes')
      await waitFor('[data-tour="nueva-orden"]')
      if (!document.querySelector('[data-tour="ot-form"]')) {
        document.querySelector('[data-tour="nueva-orden"]')?.click()
      }
      await waitFor('[data-tour="ot-form"]')
    },
    when: {
      hide: () => closeModal(),
    },
    buttons: buttons(tour),
  })

  tour.addStep({
    id: 'proformas',
    title: 'Proformas y WhatsApp',
    text: 'Cotizás acá <b>antes</b> de abrir OT. Creá la proforma y mandala con <b>Enviar por WhatsApp</b> (el PDF). El interesado no entra a Clientes hasta que acepte o lo pases a OT.',
    attachTo: {
      element: () => visibleEl('[data-tour="proforma-whatsapp"]') || visibleEl('[data-tour="nueva-proforma"]'),
      on: 'bottom',
    },
    beforeShowPromise: async () => {
      closeModal()
      await goTo('proformas')
      await waitFor('[data-tour="nueva-proforma"]')
    },
    buttons: buttons(tour),
  })

  tour.addStep({
    id: 'clientes',
    title: 'Clientes',
    text: 'La ficha: nombre, wuasapp y auto. <b>Nuevo cliente</b> o el lápiz para editar. Si creaste a alguien desde la OT, acá se completa lo que faltaba.',
    attachTo: {
      element: () => visibleEl('[data-tour="cliente-editar"]') || visibleEl('[data-tour="nuevo-cliente"]'),
      on: 'bottom',
    },
    beforeShowPromise: async () => {
      closeModal()
      await goTo('clientes')
      await waitFor('[data-tour="nuevo-cliente"]')
    },
    buttons: buttons(tour, { last: true }),
  })

  const clear = () => {
    closeModal()
    if (activeTour === tour) activeTour = null
  }
  tour.on('complete', clear)
  tour.on('cancel', clear)

  activeTour = tour
  tour.start()
  return tour
}
