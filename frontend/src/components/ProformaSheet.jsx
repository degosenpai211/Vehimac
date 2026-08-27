// Logo y colores teal se reactivan cuando se cobre el PDF con diseño original.
// import VehimacLogo from './VehimacLogo'

export const PROFORMA_TEAL = '#008B9B'
export const PROFORMA_TEAL_DARK = '#007A88'
export const PROFORMA_ROW = '#E0F2F7'

// Vista simple (sin logo ni teal) hasta cobrar el PDF con el diseño original.
const LINE = '#111'
const ROWS = 14

export function lineFigures(row) {
  const qty = Number(row?.quantity) || 0
  const unit = Number(row?.unit_price) || 0
  const pct = Number(row?.discount_percent) || 0
  const gross = Math.round(qty * unit * 100) / 100
  const discountAmt = Math.round(((gross * pct) / 100) * 100) / 100
  const net = Math.round((gross - discountAmt) * 100) / 100
  return { qty, unit, pct, gross, discountAmt, net }
}

export function formatBs(value, emptyDash = false) {
  if (emptyDash && (value == null || value === '' || Number(value) === 0)) return 'Bs -'
  const n = Number(value) || 0
  const formatted = new Intl.NumberFormat('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
  return `Bs ${formatted}`
}

export function formatPedidoDate(dateStr) {
  if (!dateStr) return ''
  const d = new Date(dateStr.includes('T') ? dateStr : `${dateStr}T12:00:00`)
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`
}

export function sheetTotals(pieces = []) {
  return pieces.reduce(
    (acc, row) => {
      const f = lineFigures(row)
      acc.gross += f.gross
      acc.discount += f.discountAmt
      acc.net += f.net
      return acc
    },
    { gross: 0, discount: 0, net: 0 },
  )
}

const th = {
  background: '#fff',
  color: '#111',
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  padding: '7px 6px',
  textAlign: 'center',
  border: `1px solid ${LINE}`,
}

const tdBase = {
  fontSize: 11,
  padding: '5px 6px',
  border: `1px solid ${LINE}`,
  height: 22,
  color: '#111',
}

export default function ProformaSheet({ proforma, sheetRef }) {
  const pieces = proforma?.pieces || []
  const padded = [...pieces]
  while (padded.length < ROWS) padded.push({})
  const totals = sheetTotals(pieces)
  const client = proforma?.client
  const contact = client?.whatsapp || client?.phone || ''

  return (
    <div
      ref={sheetRef}
      style={{
        width: '210mm',
        minHeight: '297mm',
        background: '#fff',
        color: '#111',
        fontFamily: 'Arial, Helvetica, sans-serif',
        padding: '12mm 14mm 10mm',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ textAlign: 'center', fontSize: 28, fontWeight: 800, letterSpacing: 2, marginBottom: 10 }}>
        PROFORMA
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 800, textDecoration: 'underline', lineHeight: 1.1 }}>VEHIMAC</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>NIT: 5867649016</div>
          <div style={{ fontSize: 12, marginTop: 2 }}>Dirección: B. Hilandería / C. 23 de Julio Nro 221</div>
        </div>
        {/* <VehimacLogo size={96} /> */}
      </div>

      <div style={{ height: 2, background: LINE, margin: '12px 0 10px' }} />

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 0.9fr', gap: 8, fontSize: 12, marginBottom: 4 }}>
        <div>
          <span style={{ fontWeight: 700, color: '#4b5563' }}>Trabajo para</span>
          <span style={{ marginLeft: 8, borderBottom: `1px solid ${LINE}`, display: 'inline-block', minWidth: 180 }}>
            {client?.name || ''}
          </span>
        </div>
        <div>
          <span style={{ fontWeight: 700, color: '#4b5563' }}>Contacto:</span>
          <span style={{ marginLeft: 8, borderBottom: `1px solid ${LINE}`, display: 'inline-block', minWidth: 110 }}>
            {contact}
          </span>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span style={{ fontWeight: 700, color: '#4b5563' }}>Fecha:</span>
          <span style={{ marginLeft: 8 }}>{formatPedidoDate(proforma?.created_at)}</span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 12, marginBottom: 8 }}>
        <span style={{ fontWeight: 700, color: '#4b5563' }}>Nº Pedido:</span>
        <span style={{ marginLeft: 8 }}>{proforma?.number ?? ''}</span>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
        <colgroup>
          <col style={{ width: '38%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '16%' }} />
          <col style={{ width: '10%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '12%' }} />
        </colgroup>
        <thead>
          <tr>
            <th style={{ ...th, textAlign: 'left' }}>Descripción</th>
            <th style={th}>Cantidad</th>
            <th style={th}>Precio unitario</th>
            <th style={th}>% Desc.</th>
            <th style={th}>Desc</th>
            <th style={th}>Total</th>
          </tr>
        </thead>
        <tbody>
          {padded.map((row, i) => {
            const filled = !!(row?.description || row?.unit_price || row?.quantity)
            const f = lineFigures(row)
            const bg = '#fff'
            return (
              <tr key={row.id || `empty-${i}`} style={{ background: bg }}>
                <td style={{ ...tdBase, textAlign: 'left' }}>{row.description || ''}</td>
                <td style={{ ...tdBase, textAlign: 'center' }}>{filled && f.qty ? f.qty : ''}</td>
                <td style={{ ...tdBase, textAlign: 'right' }}>{filled ? formatBs(f.unit) : ''}</td>
                <td style={{ ...tdBase, textAlign: 'center' }}>{filled && f.pct ? `${f.pct}%` : ''}</td>
                <td style={{ ...tdBase, textAlign: 'right' }}>{filled && f.discountAmt ? formatBs(f.discountAmt) : ''}</td>
                <td style={{ ...tdBase, textAlign: 'right', fontWeight: 600 }}>
                  {filled ? formatBs(f.gross, false) : 'Bs -'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 10, alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ border: '1px solid #111', minHeight: 58, padding: '6px 8px', fontSize: 12 }}>
            <span style={{ fontWeight: 700 }}>Nota:</span> {proforma?.notes || ''}
          </div>
          <div style={{ marginTop: 18, color: '#1e4d8c', fontFamily: 'Georgia, "Times New Roman", serif', lineHeight: 1.25 }}>
            <div style={{ fontSize: 16, fontStyle: 'italic', fontWeight: 700 }}>Marcelo Calvimontes C.</div>
            <div style={{ fontSize: 11, letterSpacing: 1, fontWeight: 700 }}>GERENTE GENERAL</div>
            <div style={{ fontSize: 12, fontWeight: 800, marginTop: 2 }}>=VEHIMAC=</div>
          </div>
        </div>
        <div style={{ width: 210, fontSize: 11, fontWeight: 700, border: `1px solid ${LINE}` }}>
          <div style={{ display: 'flex', background: '#fff', padding: '6px 8px', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ flex: 1 }}>TOTAL</span>
            <span>{formatBs(totals.gross, true)}</span>
          </div>
          <div style={{ display: 'flex', padding: '6px 8px', background: '#fff', borderBottom: `1px solid ${LINE}` }}>
            <span style={{ flex: 1 }}>TOTAL DESC.</span>
            <span>{formatBs(totals.discount)}</span>
          </div>
          <div style={{ display: 'flex', background: '#fff', color: '#111', padding: '7px 8px', fontSize: 12 }}>
            <span style={{ flex: 1 }}>TOTAL</span>
            <span>{formatBs(totals.net, true)}</span>
          </div>
        </div>
      </div>

      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 12, letterSpacing: 1, marginTop: 22 }}>
        GRACIAS!!!
      </div>
    </div>
  )
}
