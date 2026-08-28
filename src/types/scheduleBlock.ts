/** Bloqueo de agenda — día completo o rango horario */
export type ScheduleBlockType = 'full_day' | 'time_range'

export interface ScheduleBlock {
  id?: number | string
  /** Fecha yyyy-MM-dd */
  date: string
  type: ScheduleBlockType
  /** HH:mm — solo para time_range */
  startTime?: string
  /** HH:mm — solo para time_range */
  endTime?: string
  /** Si no se define, aplica a todas las sillas/consultorios */
  columnId?: string
  reason?: string
  createdAt: string
  updatedAt: string
}

export interface CreateScheduleBlockInput {
  date: string
  type: ScheduleBlockType
  startTime?: string
  endTime?: string
  columnId?: string
  reason?: string
}
