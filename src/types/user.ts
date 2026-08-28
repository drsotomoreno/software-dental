import type { OdontologyThsSpecialtyId } from '@/constants/ripsThsSpecialty'

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
  /** Código REPS */
  repsCode?: string
  /** Especialidad THS declarada en REPS — debe coincidir con el CUPS de consulta en RIPS */
  thsSpecialty?: OdontologyThsSpecialtyId
  /**
   * Especialidad REHUS del profesional (tabla `professionals`).
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
