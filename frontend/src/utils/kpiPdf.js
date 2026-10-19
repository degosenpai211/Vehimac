import { jsPDF } from 'jspdf'

export function downloadTextPdf({ title, subtitle, lines, filename }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let y = 18
  pdf.setFontSize(16)
  pdf.text(title, 14, y)
  y += 8
  pdf.setFontSize(11)
  pdf.text(subtitle, 14, y)
  y += 10
  pdf.setFontSize(12)
  for (const line of lines) {
    if (y > 280) {
      pdf.addPage()
      y = 18
    }
    pdf.text(String(line), 14, y)
    y += 7
  }
  pdf.save(filename)
}
