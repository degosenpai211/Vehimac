import { jsPDF } from 'jspdf'

const PAGE_WIDTH = 210
const PAGE_HEIGHT = 297
const MARGIN = 14
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const BOTTOM = 286
const HEADER = [0, 139, 155]
const INK = [15, 23, 42]
const MUTED = [100, 116, 139]
const LINE = [226, 232, 240]
const PLOT = [248, 250, 252]
const INCOME = [16, 185, 129]
const INCOME_TOP = [110, 231, 183]
const EXPENSE = [244, 63, 94]
const EXPENSE_TOP = [253, 164, 175]
const RESULT = [29, 78, 216]
const WHITE = [255, 255, 255]
const AXIS_WIDTH = 16
const PLOT_HEIGHT = 52
const CARD_GAP = 4
const BAR_WIDTH = 6

const TONES = {
  green: { fill: [240, 253, 244], ink: [21, 128, 61], accent: [22, 163, 74] },
  red: { fill: [254, 242, 242], ink: [185, 28, 28], accent: [220, 38, 38] },
  amber: { fill: [255, 251, 235], ink: [146, 64, 14], accent: [217, 119, 6] },
  brand: { fill: [239, 246, 255], ink: [29, 78, 216], accent: [37, 99, 235] },
  blue: { fill: [240, 249, 255], ink: [3, 105, 161], accent: [2, 132, 199] },
}

function toneOf(name) {
  return TONES[name] || TONES.brand
}

function formatBolivianos(amount) {
  return new Intl.NumberFormat('es-BO', { style: 'currency', currency: 'BOB' }).format(Number(amount) || 0)
}

function compactAmount(amount) {
  const value = Math.abs(Number(amount) || 0)
  const sign = amount < 0 ? '-' : ''
  if (value >= 1_000_000) return `${sign}${(value / 1_000_000).toFixed(1)} M`
  if (value >= 1000) return `${sign}${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} mil`
  return `${sign}${Math.round(value)}`
}

function niceMax(raw) {
  if (raw <= 0) return 1
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const scaled = raw / magnitude
  const step = scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10
  return step * magnitude
}

function openPage(pdf, title) {
  pdf.addPage()
  pdf.setFillColor(...HEADER)
  pdf.rect(0, 0, PAGE_WIDTH, 10, 'F')
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(9)
  pdf.setTextColor(...WHITE)
  pdf.text(title, MARGIN, 6.5)
  return 18
}

function ensureRoom(pdf, cursor, title, height) {
  if (cursor + height <= BOTTOM) return cursor
  return openPage(pdf, title)
}

function fitText(pdf, text, maxWidth) {
  const source = String(text || '')
  if (pdf.getTextWidth(source) <= maxWidth) return source
  let cut = source
  while (cut.length > 1 && pdf.getTextWidth(`${cut}...`) > maxWidth) {
    cut = cut.slice(0, -1)
  }
  return `${cut}...`
}

function drawHeader(pdf, title, subtitle) {
  pdf.setFillColor(...HEADER)
  pdf.rect(0, 0, PAGE_WIDTH, 32, 'F')
  pdf.setTextColor(...WHITE)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(18)
  pdf.text(title, MARGIN, 14)
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text(subtitle || '', MARGIN, 22)
  pdf.setFontSize(8)
  pdf.text('Vehimac', PAGE_WIDTH - MARGIN, 22, { align: 'right' })
  return 40
}

function drawCard({ pdf, card, box }) {
  const tone = toneOf(card.tone)
  pdf.setFillColor(...tone.fill)
  pdf.roundedRect(box.x, box.y, box.width, box.height, 1.6, 1.6, 'F')
  pdf.setFillColor(...tone.accent)
  pdf.rect(box.x, box.y + 1.2, 1.6, box.height - 2.4, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  pdf.text(fitText(pdf, card.label, box.width - 8), box.x + 5, box.y + 6)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...tone.ink)
  pdf.text(fitText(pdf, card.value, box.width - 8), box.x + 5, box.y + 12.5)
  if (!card.subtitle) return
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7.5)
  pdf.setTextColor(...tone.ink)
  pdf.text(fitText(pdf, card.subtitle, box.width - 8), box.x + 5, box.y + 17.5)
}

function drawCards(pdf, cursor, title, cards) {
  const cardWidth = (CONTENT_WIDTH - CARD_GAP) / 2
  let y = cursor
  for (let index = 0; index < cards.length; index += 2) {
    const pair = cards.slice(index, index + 2)
    const cardHeight = pair.some((card) => card.subtitle) ? 22 : 18
    y = ensureRoom(pdf, y, title, cardHeight + 3)
    pair.forEach((card, side) => {
      drawCard({
        pdf,
        card,
        box: { x: MARGIN + side * (cardWidth + CARD_GAP), y, width: cardWidth, height: cardHeight },
      })
    })
    y += cardHeight + 3
  }
  return y
}

function drawSwatch(pdf, x, y, color, label) {
  pdf.setFillColor(...color)
  pdf.roundedRect(x, y, 4, 3, 0.6, 0.6, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  pdf.text(label, x + 6, y + 2.5)
}

function drawLegend(pdf, y) {
  drawSwatch(pdf, MARGIN, y, INCOME, 'Ingresos')
  drawSwatch(pdf, MARGIN + 32, y, EXPENSE, 'Egresos')
  pdf.setDrawColor(...RESULT)
  pdf.setLineWidth(0.7)
  pdf.line(MARGIN + 64, y + 1.5, MARGIN + 70, y + 1.5)
  pdf.setFillColor(...RESULT)
  pdf.circle(MARGIN + 67, y + 1.5, 0.9, 'F')
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  pdf.text('Resultado', MARGIN + 72, y + 2.5)
  return y + 7
}

function chartScale(bars) {
  const nets = bars.map((bar) => (Number(bar.income) || 0) - (Number(bar.expense) || 0))
  const peak = Math.max(1, ...bars.flatMap((bar) => [Number(bar.income) || 0, Number(bar.expense) || 0]), ...nets)
  const yMax = niceMax(peak)
  const lowest = Math.min(0, ...nets)
  const yMin = lowest < 0 ? -niceMax(Math.abs(lowest)) : 0
  return { yMax, yMin, span: yMax - yMin || 1 }
}

function paintBar(pdf, x, base, height, body, top) {
  if (height <= 0) {
    pdf.setFillColor(...top)
    pdf.rect(x, base - 0.7, BAR_WIDTH, 0.7, 'F')
    return
  }
  const cap = Math.min(height * 0.42, 8)
  pdf.setFillColor(...body)
  pdf.rect(x, base - height, BAR_WIDTH, height, 'F')
  pdf.setFillColor(...top)
  pdf.rect(x, base - height, BAR_WIDTH, cap, 'F')
}

function drawGrid(pdf, plot, scale) {
  const ticks = scale.yMin < 0 ? [scale.yMax, 0, scale.yMin] : [scale.yMax, scale.yMax / 2, 0]
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(7)
  ticks.forEach((tick) => {
    const y = plot.base - ((tick - scale.yMin) / scale.span) * PLOT_HEIGHT
    const color = Math.abs(tick) < 1e-9 ? [203, 213, 225] : LINE
    pdf.setDrawColor(...color)
    pdf.setLineWidth(0.2)
    pdf.line(plot.left, y, plot.left + plot.width, y)
    pdf.setTextColor(...MUTED)
    pdf.text(compactAmount(tick), plot.left - 1.5, y + 1, { align: 'right' })
  })
}

function drawResultLine(pdf, bars, plot, scale) {
  if (bars.length < 2) return
  const points = bars.map((bar, index) => {
    const net = (Number(bar.income) || 0) - (Number(bar.expense) || 0)
    const groupWidth = plot.width / bars.length
    return {
      x: plot.left + index * groupWidth + groupWidth / 2,
      y: plot.base - ((net - scale.yMin) / scale.span) * PLOT_HEIGHT,
    }
  })
  pdf.setDrawColor(...RESULT)
  pdf.setLineWidth(0.6)
  points.slice(1).forEach((point, index) => {
    pdf.line(points[index].x, points[index].y, point.x, point.y)
  })
  points.forEach((point) => {
    pdf.setFillColor(...WHITE)
    pdf.circle(point.x, point.y, 1.15, 'F')
    pdf.setFillColor(...RESULT)
    pdf.circle(point.x, point.y, 0.7, 'F')
  })
}

function drawPlot(pdf, bars, plot, scale) {
  pdf.setFillColor(...PLOT)
  pdf.roundedRect(plot.left, plot.top, plot.width, PLOT_HEIGHT, 1.5, 1.5, 'F')
  drawGrid(pdf, plot, scale)
  const groupWidth = plot.width / bars.length
  const zero = plot.base - ((0 - scale.yMin) / scale.span) * PLOT_HEIGHT
  bars.forEach((bar, index) => {
    const center = plot.left + index * groupWidth + groupWidth / 2
    const incomeHeight = ((Number(bar.income) || 0) / scale.span) * PLOT_HEIGHT
    const expenseHeight = ((Number(bar.expense) || 0) / scale.span) * PLOT_HEIGHT
    paintBar(pdf, center - BAR_WIDTH - 0.6, zero, incomeHeight, INCOME, INCOME_TOP)
    paintBar(pdf, center + 0.6, zero, expenseHeight, EXPENSE, EXPENSE_TOP)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(7)
    pdf.setTextColor(...MUTED)
    pdf.text(fitText(pdf, bar.label, groupWidth - 2), center, plot.base + 4.5, { align: 'center' })
  })
  drawResultLine(pdf, bars, plot, scale)
}

function drawAmountTable(pdf, y, title, bars) {
  const columns = [MARGIN, MARGIN + 52, MARGIN + 104, MARGIN + 150]
  const headers = ['Período', 'Ingresos', 'Egresos', 'Resultado']
  let cursor = ensureRoom(pdf, y, title, 8)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(8)
  pdf.setTextColor(...MUTED)
  headers.forEach((header, index) => pdf.text(header, columns[index], cursor))
  cursor += 2
  pdf.setDrawColor(...LINE)
  pdf.line(MARGIN, cursor, MARGIN + CONTENT_WIDTH, cursor)
  cursor += 4.5
  bars.forEach((bar) => {
    cursor = ensureRoom(pdf, cursor, title, 6)
    const income = Number(bar.income) || 0
    const expense = Number(bar.expense) || 0
    const net = income - expense
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...INK)
    pdf.text(fitText(pdf, bar.label, 48), columns[0], cursor)
    pdf.setTextColor(...TONES.green.ink)
    pdf.text(formatBolivianos(income), columns[1], cursor)
    pdf.setTextColor(...TONES.red.ink)
    pdf.text(formatBolivianos(expense), columns[2], cursor)
    pdf.setTextColor(...(net >= 0 ? TONES.brand.ink : TONES.red.ink))
    pdf.text(formatBolivianos(net), columns[3], cursor)
    cursor += 5.5
  })
  return cursor
}

function drawSummaryChips(pdf, y, bars) {
  const income = bars.reduce((sum, bar) => sum + (Number(bar.income) || 0), 0)
  const expense = bars.reduce((sum, bar) => sum + (Number(bar.expense) || 0), 0)
  const chips = [
    { label: 'Ingresos', value: formatBolivianos(income), tone: 'green' },
    { label: 'Egresos', value: formatBolivianos(expense), tone: 'red' },
    { label: 'Resultado', value: formatBolivianos(income - expense), tone: income - expense >= 0 ? 'brand' : 'red' },
  ]
  const width = (CONTENT_WIDTH - CARD_GAP * 2) / 3
  chips.forEach((chip, index) => {
    drawCard({
      pdf,
      card: chip,
      box: { x: MARGIN + index * (width + CARD_GAP), y, width, height: 16 },
    })
  })
  return y + 20
}

function drawBars(pdf, cursor, title, bars, chartTitle) {
  const usable = (bars || []).filter((bar) => bar.label)
  if (!usable.length) return cursor
  const block = 8 + 20 + 7 + PLOT_HEIGHT + 8
  let y = ensureRoom(pdf, cursor, title, block)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(12)
  pdf.setTextColor(...INK)
  pdf.text(chartTitle || 'Ingresos y egresos', MARGIN, y)
  y += 6
  y = drawSummaryChips(pdf, y, usable)
  y = drawLegend(pdf, y)
  const scale = chartScale(usable)
  const plot = { left: MARGIN + AXIS_WIDTH, top: y, width: CONTENT_WIDTH - AXIS_WIDTH, base: y + PLOT_HEIGHT }
  drawPlot(pdf, usable, plot, scale)
  return drawAmountTable(pdf, plot.base + 10, title, usable)
}

function drawRow(pdf, y, row) {
  const tone = row.tone ? toneOf(row.tone) : null
  if (tone) {
    pdf.setFillColor(...tone.fill)
    pdf.rect(MARGIN - 1, y - 3.6, CONTENT_WIDTH + 2, 5.2, 'F')
  }
  pdf.setFont('helvetica', row.strong ? 'bold' : 'normal')
  pdf.setFontSize(9)
  pdf.setTextColor(...(tone ? tone.ink : INK))
  const value = String(row.value || '')
  const valueWidth = value ? pdf.getTextWidth(value) + 4 : 0
  pdf.text(fitText(pdf, row.label, CONTENT_WIDTH - valueWidth), MARGIN, y)
  if (value) pdf.text(value, MARGIN + CONTENT_WIDTH, y, { align: 'right' })
}

function drawSections(pdf, cursor, title, sections) {
  let y = cursor
  for (const section of sections || []) {
    y = ensureRoom(pdf, y, title, 12)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(11)
    pdf.setTextColor(...INK)
    pdf.text(section.title, MARGIN, y)
    y += 5
    const rows = section.rows || []
    if (!rows.length) {
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(9)
      pdf.setTextColor(...MUTED)
      pdf.text('Sin movimientos', MARGIN, y)
      y += 6
      continue
    }
    for (const row of rows) {
      y = ensureRoom(pdf, y, title, 6)
      if (!row.tone) {
        pdf.setDrawColor(...LINE)
        pdf.line(MARGIN, y + 1.5, MARGIN + CONTENT_WIDTH, y + 1.5)
      }
      drawRow(pdf, y, row)
      y += 5.5
    }
    y += 3
  }
  return y
}

function stampPages(pdf) {
  const total = pdf.getNumberOfPages()
  for (let page = 1; page <= total; page += 1) {
    pdf.setPage(page)
    pdf.setFont('helvetica', 'normal')
    pdf.setFontSize(8)
    pdf.setTextColor(...MUTED)
    pdf.text(`${page} / ${total}`, PAGE_WIDTH - MARGIN, PAGE_HEIGHT - 8, { align: 'right' })
  }
}

export function buildReport({ title, subtitle, cards = [], bars = [], sections = [], chartTitle }) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  let cursor = drawHeader(pdf, title, subtitle)
  if (cards.length) cursor = drawCards(pdf, cursor, title, cards)
  cursor = drawBars(pdf, cursor + 4, title, bars, chartTitle)
  drawSections(pdf, cursor + 4, title, sections)
  stampPages(pdf)
  return pdf
}

export function downloadReport({ filename, ...report }) {
  buildReport(report).save(filename)
}

export function downloadTextPdf({ title, subtitle, lines, filename }) {
  downloadReport({
    title,
    subtitle,
    filename,
    sections: [{ title: 'Detalle', rows: (lines || []).filter(Boolean).map((line) => ({ label: String(line), value: '' })) }],
  })
}
