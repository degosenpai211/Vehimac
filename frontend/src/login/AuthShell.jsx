import BrandPanel from './BrandPanel'
import './login.css'

export default function AuthShell({ children }) {
  return (
    <div className="login-page">
      <BrandPanel />
      <main className="login-main">{children}</main>
    </div>
  )
}
