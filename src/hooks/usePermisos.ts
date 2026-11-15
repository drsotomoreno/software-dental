import { useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getStoredApiAuth, type ApiSubscriptionUser } from '@/services/apiAuthService'

export type RolColaborador = 'TITULAR' | 'COLABORADOR_CLINICO' | 'COLABORADOR_ADMIN'

const ROLES_EQUIPO = new Set<RolColaborador>([
  'TITULAR',
  'COLABORADOR_CLINICO',
  'COLABORADOR_ADMIN',
])

const ROLES_RECEPCION = new Set(['recepcion', 'asistente', 'auxiliar'])

type SesionColaborador = ApiSubscriptionUser & {
  rethus?: string | null
  rol?: string
  titular_id?: string | null
}

function rolDeSesion(apiUser: SesionColaborador | null | undefined): RolColaborador | '' {
  const rol = String(apiUser?.rol ?? '').trim()
  return ROLES_EQUIPO.has(rol as RolColaborador) ? (rol as RolColaborador) : ''
}

/** Dueño de la cuenta de la clínica. El rol histórico es admin, no TITULAR. */
function esDuenoClinica(apiUser: SesionColaborador | null | undefined): boolean {
  if (!apiUser?.id || apiUser.titular_id) return false
  const rol = String(apiUser.rol || '').trim()
  if (rol === 'COLABORADOR_CLINICO' || rol === 'COLABORADOR_ADMIN') return false
  if (rol === 'TITULAR' || apiUser.isClinicOwner === true) return true
  return String(apiUser.clinicId || '') === String(apiUser.id)
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
    const rolCrudo = String(actual?.rol || '').trim().toLowerCase()
    const dueno = esDuenoClinica(actual)
    const esTitular = rol === 'TITULAR' || dueno
    const esClinico = rol === 'COLABORADOR_CLINICO'
    const esAdminColab = rol === 'COLABORADOR_ADMIN'
    const legado = rol === '' && Boolean(actual?.id)
    const legadoClinico = legado && !ROLES_RECEPCION.has(rolCrudo)
    const rethus = rethusDeSesion(actual)

    return {
      rol,
      esTitular,
      puedeEditarClinica: esTitular || esClinico || legadoClinico,
      puedeGestionarAgendaYCaja: esTitular || esClinico || esAdminColab || legado,
      puedeConfigurarSedeYEquipo: esTitular,
      rethusFirma: esTitular || esClinico || legadoClinico ? rethus : '',
    }
  }, [
    sesionId,
    apiUser?.rol,
    apiUser?.rethus,
    apiUser?.rethusNumber,
    apiUser?.isClinicOwner,
    apiUser?.clinicId,
    user?.rethusNumber,
  ])
}
