import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { clearStoredApiAuth, getStoredApiAuth, isApiSuperAdmin } from '@/services/apiAuthService'

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const path = normalizePath(location.pathname)
  const apiAuth = getStoredApiAuth()
  const hasSuperAdminRole = localStorage.getItem('doctorSEO_rol') === 'superadmin'
  const hasStoredToken = Boolean(localStorage.getItem('doctorSEO_token'))
  const hasApiSession = Boolean(apiAuth?.token && (isApiSuperAdmin(apiAuth.user) || apiAuth.user))
  const hasAccess = Boolean(user || hasApiSession || hasSuperAdminRole)

  if (path === '/') {
    return <LandingPage />
  }

  if (path === '/login') {
    return <LoginPage />
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-500">
        Verificando sesión...
      </div>
    )
  }

  if (hasStoredToken && !hasAccess) {
    localStorage.removeItem('doctorSEO_token')
    localStorage.removeItem('doctorSEO_rol')
    clearStoredApiAuth()
  }

  if (!hasAccess) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return <Outlet />
}

