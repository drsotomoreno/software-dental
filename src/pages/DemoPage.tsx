import { Navigate } from 'react-router-dom'
import { DemoShell } from '@/components/demo'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth } from '@/services/apiAuthService'

/** La demo se abre solo con sesión. Sin cuenta, el visitante pasa por el registro. */
export function DemoPage() {
  const { user, isLoading } = useAuth()
  const apiAuth = getStoredApiAuth()
  const hasSession = Boolean(user || (apiAuth?.token && apiAuth.user))

  if (isLoading && !hasSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Verificando sesión...
      </div>
    )
  }

  if (!hasSession) {
    return (
      <Navigate
        to="/registro?destino=demo"
        replace
        state={{ from: '/demo', intent: 'demo' }}
      />
    )
  }

  return <DemoShell />
}
