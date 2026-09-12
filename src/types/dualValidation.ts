export type {
  EstadoDian,
  EstadoMuv,
} from '../../shared/dualValidation.js'

export {
  ESTADO_DIAN,
  ESTADO_MUV,
  ESTADO_DIAN_VALUES,
  ESTADO_MUV_VALUES,
  DEFAULT_ESTADO_DIAN,
  DEFAULT_ESTADO_MUV,
  normalizeEstadoDian,
  normalizeEstadoMuv,
  isDianApproved,
  isMuvApprovedWithCuv,
  isTransactionLegalizada,
  injectCufeIntoRips,
  sumRipsVrServicio,
  roundCents,
  amountsMatchToTheCent,
  emptyDualValidationFields,
} from '../../shared/dualValidation.js'

import type { EstadoDian, EstadoMuv } from '../../shared/dualValidation.js'
import type { RipsMinistryError } from './ripsCuv'

/** Campos persistidos en Factura / Transacción para DIAN y MUV por separado. */
export interface DualValidationFields {
  estado_dian: EstadoDian
  codigo_cufe?: string | null
  estado_muv: EstadoMuv
  codigo_cuv?: string | null
  detalles_rechazo_muv: RipsMinistryError[]
}
