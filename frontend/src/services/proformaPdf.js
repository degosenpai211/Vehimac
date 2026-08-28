import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'
import { api, openWhatsApp } from './api'

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

export async function sendProformaPdfToClient(element, { id, number, phone, text } = {}) {
  if (!phone) throw new Error('Ese cliente no tiene WhatsApp. Cargalo en su ficha.')
  const pdf = await makeProformaPdf(element)
  const blob = pdf.output('blob')
  const { url } = await api.uploadProformaPdf(id, blob, number)
  if (!url) throw new Error('No se pudo armar el link del PDF')
  const message = `${text || `Hola, te envío la proforma VEHIMAC Nº ${number || ''}.`}\n${url}`
  if (!openWhatsApp(phone, message)) {
    throw new Error('No se pudo abrir el WhatsApp de ese cliente')
  }
  return 'whatsapp'
}
