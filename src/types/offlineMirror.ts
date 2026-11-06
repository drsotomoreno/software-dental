/** Espejo local de tablas Postgres (clinicas/usuarios/pacientes/historias). */

export type OfflineMirrorTable =
  | 'pacientes'
  | 'historias_clinicas'
  | 'usuarios'
  | 'clinicas'

export type OfflineSyncOperacion = 'INSERT' | 'UPDATE' | 'DELETE'

export interface OfflinePaciente {
  id: string
  clinica_id: string
  tipo_documento: string
  numero_documento: string
  nombres: string
  apellidos: string
  fecha_nacimiento: string
  sexo: 'F' | 'M' | 'O' | string
  email?: string | null
  telefono?: string | null
  direccion?: string | null
  created_at?: string
  updated_at: string
  deleted_at?: string | null
}

export interface OfflineHistoriaClinica {
  id: string
  clinica_id: string
  paciente_id: string
  odontologo_id?: string | null
  fecha_consulta?: string
  motivo_consulta: string
  notas_clinicas?: string | null
  diagnostico_principal: string
  finalidad_consulta: string
  causa_externa: string
  tipo_usuario: string
  estado: 'borrador' | 'cerrada_firmada' | string
  firma_digital_url?: string | null
  firma_rethus?: string | null
  firmado_en?: string | null
  created_at?: string
  updated_at: string
  deleted_at?: string | null
}

export interface OfflineUsuario {
  id: string
  email: string
  clinica_id?: string | null
  nombre_completo?: string
  registro_rethus?: string | null
  is_superadmin?: boolean
  rol?: string
  estado?: string
  updated_at?: string
}

export interface OfflineClinica {
  id: string
  nombre: string
  codigo_reps?: string | null
  direccion?: string | null
  created_at?: string
  updated_at?: string
}

/** Cola de operaciones offline → AWS RDS / API. */
export interface OfflineSyncQueueItem {
  id?: number
  tabla_afectada: OfflineMirrorTable
  operacion: OfflineSyncOperacion
  registro_id: string
  payload: Record<string, unknown>
  timestamp: number
  status?: 'pending' | 'synced' | 'error'
  error?: string
  attempts?: number
}
