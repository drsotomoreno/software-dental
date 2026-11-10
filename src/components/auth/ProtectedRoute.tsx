import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { clearStoredApiAuth, getStoredApiAuth, isApiSuperAdmin } from '@/services/apiAuthService'
import { userNeedsWelcome } from '@/utils/subscriptionAccess'

function normalizePath(pathname: string) {
  return pathname.replace(/\/+$/, '') || '/'
}

export function ProtectedRoute() {
  const { user, isLoading } = useAuth()
  const location = useLocation()
  const path = normalizePath(location.pathname)
  const apiAuth = getStoredApiAuth()
  const hasStoredToken = Boolean(localStorage.getItem('doctorSEO_token'))
  const hasApiSession = Boolean(apiAuth?.token && apiAuth.user)
  // Nunca autenticar solo por doctorSEO_rol=superadmin en localStorage.
  const hasAccess = Boolean(user || hasApiSession)

  if (path === '/') {
    return <LandingPage />
  }

  if (path === '/login') {
    return <LoginPage />
  }

  if (path === '/forgot-password') {
    return <ForgotPasswordPage />
  }

  if (path === '/reset-password' || path.startsWith('/reset-password/')) {
    return <ResetPasswordPage />
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

  // Sin plan/prueba: solo demo (pública) o pantallas para activar/comprar.
  // Nunca historia clínica completa (/app, pacientes, etc.).
  const unpaidAllowed =
    path === '/welcome-trial' ||
    path === '/suscripcion'
  if (
    userNeedsWelcome(apiAuth?.user) &&
    !unpaidAllowed &&
    !isApiSuperAdmin(apiAuth?.user)
  ) {
    return <Navigate to="/demo" replace />
  }

  return <Outlet />
}

