import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAuth, RequirePermission } from './auth/guards'
import { PERMISSION_FINANZAS_VER } from './auth/roles'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import PiezasGuardadas from './pages/PiezasGuardadas'
import Clientes from './pages/Clientes'
import Ordenes from './pages/Ordenes'
import Equipo from './pages/Equipo'
import Finanzas from './pages/Finanzas'
import Proformas from './pages/Proformas'
import ProformaPublicLink from './pages/ProformaPublicLink'
import Login from './pages/Login'
import RecuperarClave from './pages/RecuperarClave'
import Cuenta from './pages/Cuenta'

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="p/:code" element={<ProformaPublicLink />} />
        <Route path="login" element={<Login />} />
        <Route path="recuperar-clave" element={<RecuperarClave />} />
        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="piezas-guardadas" element={<PiezasGuardadas />} />
            <Route path="inventario" element={<Navigate to="/piezas-guardadas" replace />} />
            <Route path="clientes" element={<Clientes />} />
            <Route path="equipo" element={<Equipo />} />
            <Route path="ordenes" element={<Ordenes />} />
            <Route path="proformas" element={<Proformas />} />
            <Route path="cuenta" element={<Cuenta />} />
            <Route element={<RequirePermission permission={PERMISSION_FINANZAS_VER} />}>
              <Route path="finanzas" element={<Finanzas />} />
            </Route>
          </Route>
        </Route>
      </Routes>
    </AuthProvider>
  )
}
