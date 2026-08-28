/** Colores Tailwind asignados a cada categoría de procedimiento */
export type ProcedureTailwindColor =
  | 'red'
  | 'teal'
  | 'yellow'
  | 'emerald'
  | 'orange'
  | 'violet'
  | 'blue'
  | 'pink'
  | 'indigo'

export type ProcedureType =
  | 'valoracion'
  | 'ortodoncia'
  | 'operatoria'
  | 'limpieza'
  | 'cirugia_oral'
  | 'implantes'
  | 'rehabilitacion'
  | 'endodoncia'
  | 'escaneo'

export interface ProcedureTypeConfig {
  label: string
  color: ProcedureTailwindColor
}

export const PROCEDURE_TYPE_CONFIG: Record<ProcedureType, ProcedureTypeConfig> = {
  valoracion: { label: 'Valoración', color: 'red' },
  ortodoncia: { label: 'Ortodoncia', color: 'teal' },
  operatoria: { label: 'Operatoria', color: 'yellow' },
  limpieza: { label: 'Limpieza', color: 'emerald' },
  cirugia_oral: { label: 'Cirugía Oral', color: 'orange' },
  implantes: { label: 'Implantes Dentales', color: 'violet' },
  rehabilitacion: { label: 'Rehabilitación Oral', color: 'blue' },
  endodoncia: { label: 'Endodoncia', color: 'pink' },
  escaneo: { label: 'Escaneo', color: 'indigo' },
}

/** Clases Tailwind completas — obligatorio para que JIT las detecte */
export interface ProcedureColorClasses {
  bg100: string
  bg500: string
  border500: string
  text700: string
  ring500: string
  dot500: string
}

export const PROCEDURE_TAILWIND_CLASSES: Record<ProcedureTailwindColor, ProcedureColorClasses> = {
  red: {
    bg100: 'bg-red-100',
    bg500: 'bg-red-500',
    border500: 'border-red-500',
    text700: 'text-red-700',
    ring500: 'ring-red-500',
    dot500: 'bg-red-500',
  },
  teal: {
    bg100: 'bg-teal-100',
    bg500: 'bg-teal-500',
    border500: 'border-teal-500',
    text700: 'text-teal-700',
    ring500: 'ring-teal-500',
    dot500: 'bg-teal-500',
  },
  yellow: {
    bg100: 'bg-yellow-100',
    bg500: 'bg-yellow-500',
    border500: 'border-yellow-500',
    text700: 'text-yellow-700',
    ring500: 'ring-yellow-500',
    dot500: 'bg-yellow-500',
  },
  emerald: {
    bg100: 'bg-emerald-100',
    bg500: 'bg-emerald-500',
    border500: 'border-emerald-500',
    text700: 'text-emerald-700',
    ring500: 'ring-emerald-500',
    dot500: 'bg-emerald-500',
  },
  orange: {
    bg100: 'bg-orange-100',
    bg500: 'bg-orange-500',
    border500: 'border-orange-500',
    text700: 'text-orange-700',
    ring500: 'ring-orange-500',
    dot500: 'bg-orange-500',
  },
  violet: {
    bg100: 'bg-violet-100',
    bg500: 'bg-violet-500',
    border500: 'border-violet-500',
    text700: 'text-violet-700',
    ring500: 'ring-violet-500',
    dot500: 'bg-violet-500',
  },
  blue: {
    bg100: 'bg-blue-100',
    bg500: 'bg-blue-500',
    border500: 'border-blue-500',
    text700: 'text-blue-700',
    ring500: 'ring-blue-500',
    dot500: 'bg-blue-500',
  },
  pink: {
    bg100: 'bg-pink-100',
    bg500: 'bg-pink-500',
    border500: 'border-pink-500',
    text700: 'text-pink-700',
    ring500: 'ring-pink-500',
    dot500: 'bg-pink-500',
  },
  indigo: {
    bg100: 'bg-indigo-100',
    bg500: 'bg-indigo-500',
    border500: 'border-indigo-500',
    text700: 'text-indigo-700',
    ring500: 'ring-indigo-500',
    dot500: 'bg-indigo-500',
  },
}

export function getProcedureColorClasses(procedureType: ProcedureType): ProcedureColorClasses {
  const color = PROCEDURE_TYPE_CONFIG[procedureType].color
  return PROCEDURE_TAILWIND_CLASSES[color]
}

/** Color distintivo para citas marcadas como inasistencia (rojo intenso). */
export const NO_SHOW_APPOINTMENT_CLASSES: ProcedureColorClasses = {
  bg100: 'bg-red-600',
  bg500: 'bg-red-700',
  border500: 'border-red-800',
  text700: 'text-white',
  ring500: 'ring-red-600',
  dot500: 'bg-red-600',
}

export function getAppointmentDisplayClasses(appointment: {
  procedureType: ProcedureType
  status: string
}): ProcedureColorClasses {
  if (appointment.status === 'no_asistio') {
    return NO_SHOW_APPOINTMENT_CLASSES
  }
  return getProcedureColorClasses(appointment.procedureType)
}

export const PROCEDURE_TYPE_OPTIONS = Object.entries(PROCEDURE_TYPE_CONFIG).map(
  ([value, config]) => ({
    value: value as ProcedureType,
    label: config.label,
    color: config.color,
  }),
)

/** Horario del scheduler */
export const SCHEDULER_START_HOUR = 7
export const SCHEDULER_END_HOUR = 20
export const SCHEDULER_SLOT_MINUTES = 30

export function generateTimeSlots(): string[] {
  const slots: string[] = []
  for (let h = SCHEDULER_START_HOUR; h < SCHEDULER_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SCHEDULER_SLOT_MINUTES) {
      slots.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`)
    }
  }
  return slots
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function getAppointmentPosition(startTime: string, endTime: string) {
  const dayStart = SCHEDULER_START_HOUR * 60
  const dayEnd = SCHEDULER_END_HOUR * 60
  const total = dayEnd - dayStart

  const start = timeToMinutes(startTime.slice(11, 16))
  const end = timeToMinutes(endTime.slice(11, 16))

  const top = ((start - dayStart) / total) * 100
  const height = ((end - start) / total) * 100

  return { top: `${top}%`, height: `${Math.max(height, 2)}%` }
}
