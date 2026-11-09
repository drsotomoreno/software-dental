import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  authenticateUser,
  getStoredSessionToken,
  logoutSession,
  refreshSession,
  resolveAuthUser,
  seedUserCredentials,
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
import { pullCompleteClinicOnLogin } from '@/services/clinicalSyncService'
import type { AuthUser } from '@/types/auth'
import type { Permission } from '@/utils/permissions'
import { canManageClinicTeam, normalizeRole } from '@/utils/permissions'
import type { UserRole } from '@/types/user'
import { userHasTrialLimits, userNeedsWelcome } from '@/utils/subscriptionAccess'
import { useClinicalPullSync } from '@/hooks/useClinicalPullSync'
import { recoverMissingProfessionalDocument } from '@/services/professionalDocumentMemory'

interface AuthContextValue {
  user: AuthUser | null
  isLoading: boolean
  needsWelcome: boolean
  isTrialLimited: boolean
  login: (
    identifier: string,
    password: string,
  ) => Promise<{ ok: true; requiresSubscription?: boolean } | { ok: false; error: string }>
  logout: () => Promise<void>
  refreshSessionUser: () => Promise<void>
  applySessionUser: (apiUser: ApiSubscriptionUser) => void
  can: (permission: Permission) => boolean
  hasRole: (role: UserRole) => boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function sessionUserFromApi(apiUser: ApiSubscriptionUser, token: string) {
  return recoverMissingProfessionalDocument(mapApiUserToAuthUser(apiUser, token))
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  useClinicalPullSync(Boolean(user) && !isLoading)

  const loadSession = useCallback(async () => {
    let apiAuth = getStoredApiAuth()

    // Nunca fabricar una sesión Superadmin solo porque localStorage diga
    // doctorSEO_rol=superadmin. Eso filtraba privilegios tras un registro.

    if (apiAuth) {
      // Si el JSON local dice superadmin pero el correo no es el maestro, limpiar.
      if (apiAuth.user?.rol === 'superadmin' && !isApiSuperAdmin(apiAuth.user)) {
        clearStoredApiAuth()
        apiAuth = null
      }
    }

    if (apiAuth) {
      let validation = await validateApiSession(apiAuth.token)
      // Restaurar maestro solo si el correo almacenado YA es la cuenta maestra.
      if (!validation.ok && isApiSuperAdmin(apiAuth.user)) {
        const restored = await restoreMasterApiSession(apiAuth.user.email)
        if (restored && isApiSuperAdmin(restored.user)) {
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
        // Rechazar respuesta de servidor que eleve a maestro sin serlo el cliente esperado.
        if (
          isApiSuperAdmin(validation.user) &&
          !isApiSuperAdmin(apiAuth.user) &&
          String(apiAuth.user?.email || '').toLowerCase() !== SUPERADMIN_EMAIL
        ) {
          clearStoredApiAuth()
          setUser(null)
          setIsLoading(false)
          return
        }
        setStoredApiAuth(apiAuth.token, validation.user)
        await pullCompleteClinicOnLogin()
        setUser(await sessionUserFromApi(validation.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      if (validation.requiresPayment && validation.user) {
        setStoredApiAuth(apiAuth.token, validation.user)
        await pullCompleteClinicOnLogin()
        setUser(await sessionUserFromApi(validation.user, apiAuth.token))
        setIsLoading(false)
        return
      }
      clearStoredApiAuth()
    }

    const token = await getStoredSessionToken()
    const authUser = await resolveAuthUser(token)
    setUser(authUser ? await recoverMissingProfessionalDocument(authUser) : null)
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

  const login = useCallback(async (identifier: string, password: string) => {
    const raw = identifier.trim()
    const isEmail = raw.includes('@')
    const normalizedEmail = isEmail ? raw.toLowerCase() : ''
    const documentNumber = isEmail ? '' : raw.replace(/\D/g, '')
    const passwordValue = password.trim()
    const masterLogin = isMasterCredentials(normalizedEmail, passwordValue)

    const completeApiLogin = async (token: string, sessionUser: ApiSubscriptionUser) => {
      setStoredApiAuth(token, sessionUser)
      await pullCompleteClinicOnLogin()
      const authUser = await sessionUserFromApi(sessionUser, token)
      try {
        await seedUserCredentials(authUser.id, passwordValue)
      } catch (error) {
        console.error('[auth] No se pudo guardar la clave para firmar en este equipo:', error)
      }
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

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(
          isEmail
            ? { email: normalizedEmail, password: passwordValue }
            : { documentNumber, password: passwordValue },
        ),
      })
      const payload = await response.json().catch(() => ({}))

      if (masterLogin) {
        if (!response.ok || !payload.token || !payload.user) {
          return { ok: false as const, error: 'No se pudo autenticar al superadministrador.' }
        }
        // Solo aceptar sesión maestra si el servidor confirma el correo maestro.
        if (!isApiSuperAdmin(payload.user)) {
          return { ok: false as const, error: 'Credenciales de superadministrador rechazadas.' }
        }
        const granted = grantMasterLocalSession(payload.token)
        const sessionUser = {
          ...payload.user,
          rol: 'superadmin' as const,
          estado_pago: 'exento' as const,
          email: SUPERADMIN_EMAIL,
        }
        return completeApiLogin(granted.token, sessionUser)
      }

      if (
        response.ok &&
        payload.token &&
        payload.user &&
        (payload.success === true || payload.ok === true || payload.success === undefined)
      ) {
        // Un login de clínica nunca puede devolver/activar God Mode.
        if (isApiSuperAdmin(payload.user) || payload.user.rol === 'superadmin') {
          return { ok: false as const, error: 'Respuesta de sesión inválida. Intente de nuevo.' }
        }
        return completeApiLogin(payload.token, payload.user)
      }

      if (response.status === 402 && payload.user && payload.token) {
        if (isApiSuperAdmin(payload.user) || payload.user.rol === 'superadmin') {
          return { ok: false as const, error: 'Respuesta de sesión inválida. Intente de nuevo.' }
        }
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
          details: `Intento fallido: ${isEmail ? normalizedEmail : documentNumber}`,
          success: false,
          user: null,
        })
        return {
          ok: false as const,
          error: apiError || 'Documento o contraseña incorrectos.',
        }
      }
    } catch {
      // Sin bypass local de God Mode si el API no responde.
      return { ok: false as const, error: 'No se pudo conectar con el servidor.' }
    }

    if (masterLogin) {
      return { ok: false as const, error: 'No se pudo autenticar al superadministrador.' }
    }

    const result = await authenticateUser(isEmail ? normalizedEmail : documentNumber, passwordValue)
    if (!result) {
      await logAuditEvent({
        action: 'LOGIN_FAILED',
        resourceType: 'session',
        details: `Intento fallido: ${raw.toLowerCase()}`,
        success: false,
        user: null,
      })
      return { ok: false as const, error: 'Documento o contraseña incorrectos.' }
    }

    const authUser = await recoverMissingProfessionalDocument({
      ...result.user,
      sessionId: result.session.id,
    })
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
        // God Mode solo por correo maestro de la sesión, nunca por localStorage.
        if (isApiSuperAdmin(getStoredApiAuth()?.user) || isApiSuperAdmin(user as ApiSubscriptionUser)) {
          return true
        }
        if (permission === 'users.manage') {
          return canManageClinicTeam(user) || canManageClinicTeam(getStoredApiAuth()?.user)
        }
        return canWithEffectiveRole(permission, user?.role)
      },
      hasRole: (role) => {
        if (role === 'superadmin') {
          return isApiSuperAdmin(getStoredApiAuth()?.user) || isApiSuperAdmin(user as ApiSubscriptionUser)
        }
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
