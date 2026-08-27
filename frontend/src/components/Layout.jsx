import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, Package, Users, Wrench, DollarSign, Menu, X, UserCog, FileText
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Inicio' },
  { to: '/piezas-guardadas', icon: Package, label: 'Piezas guardadas' },
  { to: '/clientes', icon: Users, label: 'Clientes' },
  { to: '/equipo', icon: UserCog, label: 'Equipo' },
  { to: '/ordenes', icon: Wrench, label: 'Órdenes' },
  { to: '/proformas', icon: FileText, label: 'Proformas' },
  { to: '/finanzas', icon: DollarSign, label: 'Finanzas' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen min-h-[100dvh] flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-brand-900 text-white
        transform transition-transform duration-200 ease-in-out
        pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="flex items-center justify-between p-4 border-b border-brand-800">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Vehimac</h1>
            <p className="text-xs text-brand-300">ERP Taller</p>
          </div>
          <button className="lg:hidden p-1" onClick={() => setSidebarOpen(false)}>
            <X size={20} />
          </button>
        </div>
        <nav className="p-3 space-y-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-3 min-h-[44px] rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-700 text-white'
                    : 'text-brand-200 hover:bg-brand-800 hover:text-white'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 lg:hidden pt-[max(0.75rem,env(safe-area-inset-top))]">
          <button onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px]">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-brand-800">Vehimac ERP</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
