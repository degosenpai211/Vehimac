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

const bottomItems = [
  { to: '/', icon: LayoutDashboard, label: 'Inicio' },
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
          <button type="button" className="lg:hidden p-2 min-h-[44px] min-w-[44px]" onClick={() => setSidebarOpen(false)}>
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
          <button type="button" onClick={() => setSidebarOpen(true)} className="p-2 -ml-2 rounded-lg hover:bg-slate-100 min-h-[44px] min-w-[44px]">
            <Menu size={22} />
          </button>
          <span className="font-semibold text-brand-800">Vehimac ERP</span>
        </header>
        <main className="flex-1 p-4 lg:p-6 overflow-auto pb-[max(5.5rem,calc(4.25rem+env(safe-area-inset-bottom)))] lg:pb-[max(1rem,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>

      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="grid grid-cols-5">
          {bottomItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium ${
                  isActive ? 'text-brand-700' : 'text-slate-500'
                }`
              }
            >
              <Icon size={20} />
              {label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="flex flex-col items-center justify-center gap-0.5 py-2 min-h-[52px] text-[11px] font-medium text-slate-500"
          >
            <Menu size={20} />
            Más
          </button>
        </div>
      </nav>
    </div>
  )
}
