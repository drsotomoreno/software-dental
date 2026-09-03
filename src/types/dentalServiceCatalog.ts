import type { RehusSpecialtyId } from '@/constants/rehusSpecialties'

/**
 * Catálogo de servicios odontológicos — sección Mis Precios.
 * Soporta servicios con y sin CUPS obligatorio, homologación RIPS y especialidades REHUS.
 */

export type DentalServiceCategory =
  | 'consulta'
  | 'operatoria'
  | 'endodoncia'
  | 'cirugia'
  | 'periodoncia'
  | 'ortodoncia'
  | 'protesis'
  | 'implantes'
  | 'radiologia'
  | 'preventivo'
  | 'otro'

export interface DentalService {
  id: string
  /** NIT prestador normalizado — catálogo compartido por clínica */
  organizationId: string
  /** Código interno de la clínica (único por organización) */
  internalCode: string
  name: string
  description?: string
  category: DentalServiceCategory | string
  /**
   * CUPS principal del servicio.
   * Obligatorio cuando `requiereCupsRips` es true.
   */
  cupsCode?: string | null
  /** Si true, el servicio exige CUPS para facturación/RIPS. */
  requiereCupsRips: boolean
  /**
   * CUPS homólogo opcional para servicios sin CUPS propio
   * (p. ej. paquetes clínicos que se reportan con un CUPS equivalente).
   */
  cupsHomologo?: string | null
  defaultPrice: number
  currency: 'COP'
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** Relación N:M — especialidades REHUS autorizadas para ejecutar el servicio. */
export interface DentalServiceAuthorizedSpecialty {
  id: string
  serviceId: string
  rehusSpecialtyId: RehusSpecialtyId
  createdAt: string
}

/**
 * Profesional de la clínica vinculado a usuario del sistema.
 * Incluye especialidad REHUS habilitada (REPS).
 */
export interface Professional {
  id: string
  userId: string
  organizationId: string
  documentType: string
  documentNumber: string
  firstName: string
  lastName: string
  professionalLicense?: string
  /** Número RETHUS del profesional tratante */
  rethusNumber?: string
  rethusStatus?: 'activo' | 'inactivo' | 'pendiente'
  /** Especialidad RETHUS/REPS habilitada del profesional */
  rehusSpecialty: RehusSpecialtyId
  repsCode?: string
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/** Tarifa del usuario sobre un servicio del catálogo (capa Mis Precios). */
export interface DentalServicePrice {
  id: string
  serviceId: string
  userId: string
  price: number
  currency: 'COP'
  updatedAt: string
}

export interface DentalServiceFormInput {
  internalCode: string
  name: string
  description?: string
  category: DentalServiceCategory | string
  cupsCode?: string | null
  requiereCupsRips: boolean
  cupsHomologo?: string | null
  defaultPrice: number
  /**
   * Especialidades REHUS autorizadas para ejecutar el servicio.
   * Si incluye `odontologia_general`, cualquier especialista puede realizarlo y evolucionarlo.
   */
  authorizedSpecialtyIds: RehusSpecialtyId[]
  isActive?: boolean
}
