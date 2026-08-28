import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { openWhatsApp } from './api'

async function makeProformaPdf(element) {
  if (!element) throw new Error('No hay documento para enviar')
  const scale = typeof window !== 'undefined' && window.innerWidth < 768 ? 1.5 : 2
  const canvas = await html2canvas(element, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
  const img = canvas.toDataURL('image/png')
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageW = 210
  const pageH = 297
  const imgH = (canvas.height * pageW) / canvas.width
  pdf.addImage(img, 'PNG', 0, 0, pageW, Math.min(imgH, pageH))
  return pdf
}

export async function shareProformaPdf(element, { number, phone, text } = {}) {
  const pdf = await makeProformaPdf(element)
  const blob = pdf.output('blob')
  const file = new File([blob], `Proforma-${number || 'VEHIMAC'}.pdf`, { type: 'application/pdf' })
  const message = text || `Proforma VEHIMAC Nº ${number || ''}`
  const payload = {
    title: `Proforma ${number || 'VEHIMAC'}`,
    text: message,
    files: [file],
  }
  if (typeof navigator.share === 'function') {
    try {
      const canFiles = !navigator.canShare || navigator.canShare({ files: [file] })
      if (canFiles) {
        await navigator.share(payload)
        return 'shared'
      }
    } catch (err) {
      if (err?.name === 'AbortError') throw err
    }
  }
  if (phone && openWhatsApp(phone, message)) {
    return 'whatsapp'
  }
  throw new Error('Este celular no pudo abrir WhatsApp con el PDF. En iPhone usá Safari o la app del inicio.')
}
