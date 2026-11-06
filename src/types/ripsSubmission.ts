/**
 * Historial local de radicaciones RIPS ante el MUV (Resolución 2275).
 * Vive en Dexie (`rips_submissions`) y se consulta desde Exportación RIPS.
 *
 * Solo `id` y `fecha_radicacion` están indexados. `cuv`, `cantidad_historias`,
 * `estado` y `payload_json` se guardan en el objeto y no forman parte del índice.
 */
export interface RipsSubmission {
  /** UUID generado en el cliente. Clave primaria (no autoincremental). */
  id: string
  /** ISO 8601. Indexada para ordenar el historial. */
  fecha_radicacion: string
  /** Código único de validación devuelto por el MUV. Vacío si el envío no fue aceptado. */
  cuv: string
  /** Atenciones (historias clínicas o notas) incluidas en el paquete. */
  cantidad_historias: number
  /** Resultado local de la radicación: `radicado`, `rechazado` o `error`. */
  estado: string
  /**
   * Objeto JSON exacto enviado al Ministerio (el RIPS de la Resolución 2275).
   * No indexado: se conserva para auditoría y no entra al esquema de índices.
   */
  payload_json: unknown
}
