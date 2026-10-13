import { BRAND } from './brandConfig'

function BrandLogo() {
  return (
    <div className="brand-logo">
      <img src={BRAND.logoUrl} alt={`Logo de ${BRAND.name}`} />
    </div>
  )
}

export default function BrandPanel() {
  return (
    <aside className="brand-panel">
      <div className="brand-lockup">
        <BrandLogo />
        <p className="brand-panel__tagline">{BRAND.tagline}</p>
      </div>
    </aside>
  )
}
