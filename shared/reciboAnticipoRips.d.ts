export const ESTADO_PENDIENTE_TRANSMISION: 'PENDIENTE_TRANSMISION'

export interface EvolucionAnticipo {
  id?: string
  descripcion?: string
  procedure?: string
  fechaEvolucion?: string
  signedAt?: string
  date?: string
  estadoClinico?: string
  estado?: string
  sinRealizar?: boolean
  sinFirmar?: boolean
  firmada?: boolean
  isLocked?: boolean
}

export interface PendienteAnticipo {
  id: string
  descripcion: string
}

export interface TransmisionAnticipo {
  puedeTransmitir: boolean
  estado: string
  code: string | null
  pendientes: PendienteAnticipo[]
  anticipo: boolean
  fechaRecaudo: string | null
  fechaMaximaEvolucion?: string
  fechaCorte?: string
  message: string
}

export function evaluarTransmisionAnticipo(input?: {
  evoluciones?: EvolucionAnticipo[]
  fechaRecaudo?: string
  fechaTransmision?: string
}): TransmisionAnticipo
