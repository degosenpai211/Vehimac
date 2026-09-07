export default function VehimacLogo({ size = 110 }) {
  return (
    <img
      src="/vehimac-logo.jpg"
      alt="VEHIMAC — Innovación y excelencia"
      width={size}
      height={size}
      style={{
        display: 'block',
        width: size,
        height: size,
        objectFit: 'contain',
        background: '#fff',
      }}
    />
  )
}
