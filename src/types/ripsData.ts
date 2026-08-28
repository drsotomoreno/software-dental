/**
 * Estructura RIPS JSON — Resolución 2275 de 2023 y actualizaciones.
 * Alias semántico sobre los tipos oficiales del módulo RIPS.
 */
export type {
  RipsTransaction as RIPSData,
  RipsUsuario as RIPSUsuario,
  RipsServicios as RIPSServicios,
  RipsConsulta as RIPSConsulta,
  RipsProcedimiento as RIPSProcedimiento,
} from './rips'

export interface RIPSDataSummary {
  numFactura: string
  numDocumentoIdObligado: string
  usuarioCount: number
  consultaCount: number
  procedimientoCount: number
  totalVrServicios: number
}
