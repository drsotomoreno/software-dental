import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'

export type RolColaborador = 'TITULAR' | 'COLABORADOR_CLINICO' | 'COLABORADOR_ADMIN'

const ROLES_EQUIPO = new Set<RolColaborador>([
  'TITULAR',
  'COLABORADOR_CLINICO',
  'COLABORADOR_ADMIN',
])

type SesionColaborador = ApiSubscriptionUser & {
  rethus?: string | null
  rol?: string
}

function rolDeSesion(apiUser: SesionColaborador | null | undefined): RolColaborador | '' {
  const rol = String(apiUser?.rol ?? '').trim()
  return ROLES_EQUIPO.has(rol as RolColaborador) ? (rol as RolColaborador) : ''
}

function rethusDeSesion(apiUser: SesionColaborador | null | undefined): string {
  return String(apiUser?.rethus ?? apiUser?.rethusNumber ?? '').trim()
}

/**
 * Permisos del equipo del titular.
 * Lee el `rol` guardado en la sesión API. El perfil mapeado de la app
 * convierte roles desconocidos en odontólogo y no sirve para esta distinción.
 */
export function usePermisos() {
  const { user } = useAuth()
  const apiUser = getStoredApiAuth()?.user as SesionColaborador | undefined
  const sesionId = user?.id || apiUser?.id || ''

  return useMemo(() => {
    const actual = getStoredApiAuth()?.user as SesionColaborador | undefined
    const rol = rolDeSesion(actual)
    const esTitular = rol === 'TITULAR'
    const esClinico = rol === 'COLABORADOR_CLINICO'
    const rethus = rethusDeSesion(actual)

    return {
      rol,
      esTitular,
      puedeEditarClinica: esTitular || esClinico,
      puedeGestionarAgendaYCaja: ROLES_EQUIPO.has(rol as RolColaborador),
      puedeConfigurarSedeYEquipo: esTitular,
      rethusFirma: esTitular || esClinico ? rethus : '',
    }
  }, [sesionId, apiUser?.rol, apiUser?.rethus, apiUser?.rethusNumber, user?.rethusNumber])
}
