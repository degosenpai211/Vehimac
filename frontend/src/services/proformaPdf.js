import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { api, openWhatsApp } from './api'

const MAX_UPLOAD = 7.5 * 1024 * 1024
// Prueba del link corto /p/xxxxxx: dejar en false para mandar la URL larga de Supabase.
const USE_SHORT_PROFORMA_LINK = false

function canvasToJpeg(canvas, quality) {
  return canvas.toDataURL('image/jpeg', quality)
}

async function renderSheet(element, scale) {
  return html2canvas(element, {
    scale,
    backgroundColor: '#ffffff',
    useCORS: true,
    logging: false,
  })
}

function sheetToPdf(canvas, quality) {
  const img = canvasToJpeg(canvas, quality)
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true })
  const pageW = 210
  const pageH = 297
  const imgH = (canvas.height * pageW) / canvas.width
  pdf.addImage(img, 'JPEG', 0, 0, pageW, Math.min(imgH, pageH), undefined, 'FAST')
  return pdf.output('blob')
}

async function makeProformaPdf(element) {
  if (!element) throw new Error('No hay documento para enviar')
  const scale = typeof window !== 'undefined' && window.innerWidth < 768 ? 1.25 : 1.5
  const canvas = await renderSheet(element, scale)
  for (const quality of [0.82, 0.7, 0.55]) {
    const blob = sheetToPdf(canvas, quality)
    if (blob.size <= MAX_UPLOAD) return blob
  }
  throw new Error('El PDF quedó pesado. Probá de nuevo o recargá la página.')
}

export async function sendProformaPdfToClient(element, { id, number, phone } = {}) {
  if (!phone) throw new Error('Ese cliente no tiene WhatsApp. Cargalo en su ficha.')
  const blob = await makeProformaPdf(element)
  const uploaded = await api.uploadProformaPdf(id, blob, number)
  const share = USE_SHORT_PROFORMA_LINK
    ? (uploaded?.share_url || (uploaded?.short_code ? `https://vehimacc.vercel.app/p/${uploaded.short_code}` : uploaded?.url))
    : uploaded?.url
  if (!share) throw new Error('No se pudo armar el link del PDF')
  if (!openWhatsApp(phone, share)) {
    throw new Error('No se pudo abrir el WhatsApp de ese cliente')
  }
  return 'whatsapp'
}
