import type {
  ConsultaExternaOdontologica,
  ContextoValidacionRipsOdontologia,
  ProcedimientoOdontologico,
  ResultadoValidacionRipsOdontologia,
} from '../src/types/ripsOdontologia2275'

export class ValidadorRipsOdontologia2275 {
  contexto: ContextoValidacionRipsOdontologia
  constructor(contexto?: ContextoValidacionRipsOdontologia)
  validar(rips: { usuarios?: unknown[] }): ResultadoValidacionRipsOdontologia
  validarConsultaExterna(consulta: ConsultaExternaOdontologica, path: string): ResultadoValidacionRipsOdontologia['errores']
  validarProcedimientoOdontologico(
    procedimiento: ProcedimientoOdontologico,
    path: string,
  ): ResultadoValidacionRipsOdontologia['errores']
}

export function validarRipsOdontologia2275(
  rips: { usuarios?: unknown[] },
  contexto?: ContextoValidacionRipsOdontologia,
): ResultadoValidacionRipsOdontologia
