import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

export async function downloadProformaPdf(element, number) {
  if (!element) throw new Error('No hay documento para exportar')
  const canvas = await html2canvas(element, {
    scale: 2,
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
  pdf.save(`Proforma-${number || 'vehimac'}.pdf`)
}
