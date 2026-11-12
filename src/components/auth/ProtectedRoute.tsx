import { Navigate, Outlet, useLocation } from 'react-router-dom'

import { useAuth } from '@/contexts/AuthContext'
import { ForgotPasswordPage } from '@/pages/ForgotPasswordPage'
import { LandingPage } from '@/pages/LandingPage'
import { LoginPage } from '@/pages/LoginPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { clearStoredApiAuth, getStoredApiAuth } from '@/services/apiAuthService'
import { accessTier } from '@/utils/subscriptionAccess'

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
  const oauthReturnFlag = new URLSearchParams(location.search).get('googleDrive')
  const returningFromGoogleDrive =
    oauthReturnFlag === 'connected' || oauthReturnFlag === 'error'

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

  // Tras OAuth: si ya hay token/sesión local, no bloquear /perfil en "Verificando…".
  // Si no hay token en este host, salir del loading (apex→www debió unificar dominio).
  if (isLoading) {
    if (returningFromGoogleDrive && (hasAccess || hasStoredToken)) {
      return <Outlet />
    }
    if (!hasStoredToken && !hasApiSession && !user) {
      return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
    }
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
    return (
      <Navigate
        to="/login"
        replace
        state={{ from: location.pathname + (location.search || '') }}
      />
    )
  }

  // Sin prueba vigente ni plan pagado: no hay historias clínicas.
  // El estado guardado en el navegador no abre el consultorio por sí solo.
  const unpaidAllowed = path === '/welcome-trial' || path === '/suscripcion'
  if (accessTier(apiAuth?.user) === 'none' && !unpaidAllowed) {
    return <Navigate to="/demo" replace />
  }

  return <Outlet />
}

