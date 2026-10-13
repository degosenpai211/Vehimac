import { Navigate, Outlet, useLocation } from 'react-router-dom'
import Loading from '../components/Loading'
import { can } from './roles'
import { useAuth } from './AuthContext'

export function RequireAuth() {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading) return <Loading />
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />
  return <Outlet />
}

export function RequirePermission({ permission }) {
  const { user } = useAuth()
  if (!can(user, permission)) return <Navigate to="/" replace />
  return <Outlet />
}
