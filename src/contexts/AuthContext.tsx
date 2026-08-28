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
  mapApiUserToAuthUser,
  setStoredApiAuth,
  SUPERADMIN_EMAIL,
  validateApiSession,
} from '@/services/apiAuthService'
import { logAuditEvent } from '@/services/auditService'
import type { AuthUser } from '@/types/auth'
import type { Permission } from '@/utils/permissions'
import { normalizeRole } from '@/utils/permissions'
import type { UserRole } from '@/types/user'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>
  logout: () => Promise<void>
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
    const apiAuth = getStoredApiAuth()

    if (!apiAuth && storedToken && storedRole === 'superadmin') {
      const fallbackUser = {
        id: 'superadmin-session',
        nombre: 'Dr. Mauricio Soto',
        email: SUPERADMIN_EMAIL,
        rol: 'superadmin' as const,
        estado_pago: 'exento' as const,
        fecha_vencimiento: null,
      }
      setStoredApiAuth(storedToken, fallbackUser)
      setUser(mapApiUserToAuthUser(fallbackUser, storedToken))
      setIsLoading(false)
      return
    }

    if (apiAuth) {
      if (isApiSuperAdmin(apiAuth.user) || localStorage.getItem('doctorSEO_rol') === 'superadmin') {
        setUser(mapApiUserToAuthUser(apiAuth.user, apiAuth.token))
        setIsLoading(false)
        return
      }

      const validation = await validateApiSession(apiAuth.token)
      if (validation.ok) {
        setStoredApiAuth(apiAuth.token, validation.user)
        setUser(mapApiUserToAuthUser(validation.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      if (validation.requiresPayment && validation.user) {
        setStoredApiAuth(apiAuth.token, validation.user)
      } else {
        clearStoredApiAuth()
      }
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

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email: normalizedEmail, password }),
      })
      const payload = await response.json().catch(() => ({}))

      if (
        response.ok &&
        payload.token &&
        payload.user &&
        (payload.success === true || payload.ok === true || payload.success === undefined)
      ) {
        setStoredApiAuth(payload.token, payload.user)
        const authUser = mapApiUserToAuthUser(payload.user, payload.token)
        setUser(authUser)
        window.dispatchEvent(new CustomEvent('doctorseolabs-auth-ready'))
        await logAuditEvent({
          action: 'LOGIN_SUCCESS',
          resourceType: 'session',
          resourceId: payload.token,
          user: authUser,
        })
        return { ok: true as const }
      }
    } catch {
      // API no disponible — intentar auth local
    }

    const result = await authenticateUser(email, password)
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
      login,
      logout,
      can: (permission) => canWithEffectiveRole(permission, user?.role),
      hasRole: (role) => {
        const effective = getEffectiveRole(user?.role)
        return effective ? normalizeRole(effective) === normalizeRole(role) : false
      },
    }),
    [user, isLoading, login, logout],
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
