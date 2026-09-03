import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'
import type { RepsHabilitationStatus } from '@/utils/repsCode'
import type { RethusStatus } from '@/utils/rethusNumber'

export type UserRole = 'superadmin' | 'admin' | 'odontologo' | 'recepcion'

/** Roles almacenados en versiones anteriores de IndexedDB. */
export type LegacyUserRole = 'administrador' | 'auxiliar'

export interface UserProfile {
  id: string
  email: string
  firstName: string
  lastName: string
  documentType: string
  documentNumber: string
  professionalLicense?: string
  role: UserRole
  clinicName: string
  /** NIT prestador — RIPS */
  providerNit?: string
  /** Código REPS de habilitación de la sede (12 dígitos, ej. 6800103898-01) */
  repsCode?: string
  /** Estado de habilitación REPS de la sede */
  repsStatus?: RepsHabilitationStatus
  /**
   * Servicios de especialidad habilitados en el portafolio REPS de la sede.
   * Sin habilitación explícita no se factura ni se genera RIPS de esa especialidad.
   */
  repsEnabledSpecialties?: OdontologyThsSpecialtyId[]
  /** Número RETHUS (consecutivo nacional, ej. 438265) */
  rethusNumber?: string
  /** Estado de inscripción RETHUS */
  rethusStatus?: RethusStatus
  /** Especialidad THS declarada en REPS — debe coincidir con el CUPS de consulta en RIPS */
  thsSpecialty?: OdontologyThsSpecialtyId
  /**
   * Especialidad RETHUS del profesional (tabla `professionals`).
   * En nuevas instalaciones se sincroniza desde `thsSpecialty` en la migración Dexie v12.
   */
  rehusSpecialty?: OdontologyThsSpecialtyId
  avatarUrl?: string
}

export interface PriceItem {
  id: string
  userId: string
  procedure: string
  cupsCode: string
  price: number
  currency: 'COP'
  /** Categoría para tratamientos personalizados (CUSTOM_*). */
  category?: string
}

export type SubscriptionPlan = 'basico' | 'profesional' | 'clinica'

export interface Subscription {
  userId: string
  plan: SubscriptionPlan
  status: 'activa' | 'vencida' | 'prueba'
  expiresAt: string
  maxPatients: number
}
