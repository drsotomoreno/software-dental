import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  authenticateUser,
  getStoredSessionToken,
  logoutSession,
  refreshSession,
  resolveAuthUser,
} from '@/services/authService'
import {
  clearStoredApiAuth,
  canWithEffectiveRole,
  getEffectiveRole,
  getStoredApiAuth,
  isApiSuperAdmin,
  grantMasterLocalSession,
  isMasterCredentials,
  mapApiUserToAuthUser,
  restoreMasterApiSession,
  setStoredApiAuth,
  SUPERADMIN_EMAIL,
  validateApiSession,
  type ApiSubscriptionUser,
} from '@/services/apiAuthService'
import { logAuditEvent } from '@/services/auditService'
import type { AuthUser } from '@/types/auth'
import type { Permission } from '@/utils/permissions'
import { normalizeRole } from '@/utils/permissions'
import type { UserRole } from '@/types/user'
import { userHasTrialLimits, userNeedsWelcome } from '@/utils/subscriptionAccess'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  needsWelcome: boolean
  isTrialLimited: boolean
  login: (
    email: string,
    password: string,
  ) => Promise<{ ok: true; requiresSubscription?: boolean } | { ok: false; error: string }>
  logout: () => Promise<void>
  refreshSessionUser: () => Promise<void>
  applySessionUser: (apiUser: ApiSubscriptionUser) => void
  can: (permission: Permission) => boolean
  hasRole: (role: UserRole) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const loadSession = useCallback(async () => {
    const storedRole = localStorage.getItem('doctorSEO_rol')
    const storedToken = localStorage.getItem('doctorSEO_token')
    let apiAuth = getStoredApiAuth()

    if (!apiAuth && storedToken && storedRole === 'superadmin') {
      const fallbackUser = {
        id: 'superadmin-session',
        nombre: 'Dr. Mauricio Soto',
        firstName: 'Mauricio',
        lastName: 'Soto',
        email: SUPERADMIN_EMAIL,
        rol: 'superadmin' as const,
        estado_pago: 'exento' as const,
        fecha_vencimiento: null,
      }
      setStoredApiAuth(storedToken, fallbackUser)
      apiAuth = { token: storedToken, user: fallbackUser }
    }

    if (apiAuth) {
      let validation = await validateApiSession(apiAuth.token)
      if (!validation.ok && isApiSuperAdmin(apiAuth.user)) {
        const restored = await restoreMasterApiSession()
        if (restored) {
          validation = {
            ok: true as const,
            user: restored.user,
            expiresAt: null as unknown as string,
            rol: 'superadmin' as const,
          }
          apiAuth = restored
        }
      }
      if (validation.ok) {
        setStoredApiAuth(apiAuth.token, validation.user)
        setUser(mapApiUserToAuthUser(validation.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      if (validation.requiresPayment && validation.user) {
        setStoredApiAuth(apiAuth.token, validation.user)
        setUser(mapApiUserToAuthUser(validation.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      if (isApiSuperAdmin(apiAuth.user)) {
        setUser(mapApiUserToAuthUser(apiAuth.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      clearStoredApiAuth()
    }

    const token = await getStoredSessionToken()
    const authUser = await resolveAuthUser(token)
    setUser(authUser)
    setIsLoading(false)
  }, [])

  useEffect(() => {
    loadSession()

    const handleApiAuthReady = () => {
      loadSession()
    }

    window.addEventListener('doctorseolabs-auth-ready', handleApiAuthReady)
    return () => window.removeEventListener('doctorseolabs-auth-ready', handleApiAuthReady)
  }, [loadSession])

  const login = useCallback(async (email: string, password: string) => {
    const normalizedEmail = email.trim().toLowerCase()
    const passwordValue = password.trim()
    const masterLogin = isMasterCredentials(normalizedEmail, passwordValue)

    const completeApiLogin = async (token: string, sessionUser: ApiSubscriptionUser) => {
      setStoredApiAuth(token, sessionUser)
      const authUser = mapApiUserToAuthUser(sessionUser, token)
      setUser(authUser)
      window.dispatchEvent(new CustomEvent('doctorseolabs-auth-ready'))
      await logAuditEvent({
        action: 'LOGIN_SUCCESS',
        resourceType: 'session',
        resourceId: token,
        user: authUser,
      })
      return { ok: true as const, requiresSubscription: userNeedsWelcome(sessionUser) }
    }

    if (masterLogin) {
      localStorage.setItem('doctorSEO_rol', 'superadmin')
      document.documentElement.dataset.superadmin = 'true'
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password: passwordValue }),
      })
      const payload = await response.json().catch(() => ({}))

      if (masterLogin) {
        const granted = grantMasterLocalSession(payload.token)
        const sessionUser = payload.user
          ? { ...payload.user, rol: 'superadmin' as const, estado_pago: 'exento' as const, email: SUPERADMIN_EMAIL }
          : granted.user
        return completeApiLogin(granted.token, sessionUser)
      }

      if (
        response.ok &&
        payload.token &&
        payload.user &&
        (payload.success === true || payload.ok === true || payload.success === undefined)
      ) {
        return completeApiLogin(payload.token, payload.user)
      }

      if (response.status === 402 && payload.user && payload.token) {
        return completeApiLogin(payload.token, payload.user)
      }

      if (response.status === 402 && payload.user) {
        return {
          ok: false as const,
          error: 'Su cuenta no tiene un plan activo. Inicie sesión de nuevo para elegir un plan o la prueba de 7 días.',
        }
      }

      const apiError = String(payload.error ?? '').trim()
      if (apiError || !response.ok) {
        await logAuditEvent({
          action: 'LOGIN_FAILED',
          resourceType: 'session',
          details: `Intento fallido: ${normalizedEmail}`,
          success: false,
          user: null,
        })
        return {
          ok: false as const,
          error: apiError || 'Correo o contraseña incorrectos.',
        }
      }
    } catch {
      if (masterLogin) {
        const granted = grantMasterLocalSession()
        const authUser = mapApiUserToAuthUser(granted.user, granted.token)
        setUser(authUser)
        window.dispatchEvent(new CustomEvent('doctorseolabs-auth-ready'))
        return { ok: true as const }
      }
    }

    if (masterLogin) {
      const granted = grantMasterLocalSession()
      const authUser = mapApiUserToAuthUser(granted.user, granted.token)
      setUser(authUser)
      window.dispatchEvent(new CustomEvent('doctorseolabs-auth-ready'))
      return { ok: true as const }
    }

    const result = await authenticateUser(normalizedEmail, passwordValue)
    if (!result) {
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        resourceType: 'session',
        details: `Intento fallido: ${email.trim().toLowerCase()}`,
        success: false,
        user: null,
      })
      return { ok: false as const, error: 'Correo o contraseña incorrectos.' }
    }

    const authUser: AuthUser = { ...result.user, sessionId: result.session.id }
    setUser(authUser)

    await logAuditEvent({
      action: 'LOGIN_SUCCESS',
      resourceType: 'session',
      resourceId: result.session.id,
      user: authUser,
    })

    return { ok: true as const }
  }, [])

  const refreshSessionUser = useCallback(async () => {
    await loadSession()
  }, [loadSession])

  const applySessionUser = useCallback((apiUser: ApiSubscriptionUser) => {
    const stored = getStoredApiAuth()
    const token = stored?.token || `session-${apiUser.id}`
    setStoredApiAuth(token, apiUser)
    setUser(mapApiUserToAuthUser(apiUser, token))
  }, [])

  const logout = useCallback(async () => {
    if (user) {
      await logAuditEvent({
        action: 'LOGOUT',
        resourceType: 'session',
        resourceId: user.sessionId,
        user,
      })
    }
    clearStoredApiAuth()
    await logoutSession(user?.sessionId ?? (await getStoredSessionToken()))
    setUser(null)
  }, [user])

  useEffect(() => {
    if (!user?.sessionId) return

    const interval = window.setInterval(() => {
      refreshSession(user.sessionId).catch(() => undefined)
    }, 15 * 60 * 1000)

    return () => window.clearInterval(interval)
  }, [user?.sessionId])

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      needsWelcome: userNeedsWelcome(getStoredApiAuth()?.user),
      isTrialLimited: userHasTrialLimits(getStoredApiAuth()?.user),
      login,
      logout,
      refreshSessionUser,
      applySessionUser,
      can: (permission) => {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('doctorSEO_rol') === 'superadmin') {
          return true
        }
        return canWithEffectiveRole(permission, user?.role)
      },
      hasRole: (role) => {
        const effective = getEffectiveRole(user?.role)
        return effective ? normalizeRole(effective) === normalizeRole(role) : false
      },
    }),
    [user, isLoading, login, logout, refreshSessionUser, applySessionUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider')
  }
  return context
}
