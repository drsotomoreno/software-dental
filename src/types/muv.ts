/** Contrato del Mecanismo Único de Validación (MUV / SISPRO), Resolución 2275. */

export interface MuvIdentificacion {
  tipo: string
  numero: string
}

export interface MuvLoginRequest {
  persona: {
    identificacion: MuvIdentificacion
  }
  clave: string
  nit: string
  /** 8.1 LoginSispro. RE = profesional independiente. */
  tipoUsuario?: 'RE' | 'PIN' | 'PINx' | 'PIE' | string
}

export interface MuvLoginResult {
  token: string
  expiresIn?: number
  login: boolean
}

export interface MuvResultadoValidacion {
  clase: 'NOTIFICACION' | 'RECHAZADO'
  codigo: string
  descripcion: string
  mensaje: string
  pathFuente?: string | null
  fuente?: string | null
}

export interface MuvCargarFevRipsResult {
  cuv: string
  procesoId?: string | number | null
  fechaRadicacion?: string | null
  estado?: string
  notificaciones?: MuvResultadoValidacion[]
}

export interface MuvMinistryIssue {
  code?: string
  field?: string
  message: string
  line?: number
}

export type MuvErrorCode = 'RED' | 'AUTH' | 'VALIDACION' | 'RECHAZO' | 'HTTP' | 'CONFIG'

export interface MuvTokenProvider {
  (): string | null | undefined | Promise<string | null | undefined>
}

export interface MuvClientOptions {
  baseUrl?: string
  authPath?: string
  cargarPath?: string
  /** URL absoluta de login; tiene prioridad sobre baseUrl + authPath. */
  authUrl?: string
  timeoutMs?: number
  /** Se consulta en cada carga si la petición no trae token propio. */
  getToken?: MuvTokenProvider
  fetch?: typeof fetch
}
