import { Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import PiezasGuardadas from './pages/PiezasGuardadas'
import Clientes from './pages/Clientes'
import Ordenes from './pages/Ordenes'
import Equipo from './pages/Equipo'
import Finanzas from './pages/Finanzas'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="piezas-guardadas" element={<PiezasGuardadas />} />
        <Route path="inventario" element={<Navigate to="/piezas-guardadas" replace />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="equipo" element={<Equipo />} />
        <Route path="ordenes" element={<Ordenes />} />
        <Route path="finanzas" element={<Finanzas />} />
      </Route>
    </Routes>
  )
}
