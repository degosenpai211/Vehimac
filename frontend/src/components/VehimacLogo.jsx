const TEAL = '#008B9B'

export default function VehimacLogo({ size = 92 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', border: `3px solid ${TEAL}`, background: '#fff' }}
    >
      <rect x="0" y="0" width="120" height="120" fill="#ffffff" />
      <g transform="translate(60,42)" fill={TEAL}>
        <polygon points="0,-18 8,-4 0,6 -8,-4" fill={TEAL} />
        <polygon points="0,-10 22,-2 18,6 0,2" fill={TEAL} opacity="0.92" />
        <polygon points="0,-10 -22,-2 -18,6 0,2" fill={TEAL} opacity="0.92" />
        <polygon points="-26,4 -8,10 -4,4 -18,-2" fill={TEAL} />
        <polygon points="26,4 8,10 4,4 18,-2" fill={TEAL} />
      </g>
      <text
        x="60"
        y="78"
        textAnchor="middle"
        fill="#0f172a"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="13"
        letterSpacing="1"
      >
        VEHIMAC
      </text>
      <text
        x="60"
        y="94"
        textAnchor="middle"
        fill={TEAL}
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="5.2"
        letterSpacing="0.6"
      >
        INNOVACION Y EXCELENCIA
      </text>
    </svg>
  )
}
