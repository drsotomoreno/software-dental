import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { isHabilitarFacturacionEps } from '@/utils/habilitarFacturacionEps'

/** La exportación masiva de RIPS solo existe si la clínica factura a EPS. */
export function EpsBillingRoute() {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!isHabilitarFacturacionEps(user?.habilitarFacturacionEps)) {
    return <Navigate to="/pacientes" replace />
  }

  return <Outlet />
}
