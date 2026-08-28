import { db } from '@/db/database'
import type { Appointment, CreateAppointmentInput } from '@/types/appointment'

export const CITAS_STORAGE_KEY = 'citas_dental'

export const AGENDA_RENDER_EVENT = 'agenda:render-citas'
export const AGENDA_REASIGNAR_EVENT = 'agenda:reasignar-cita'

export function getCitasFromStorage(): Appointment[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CITAS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Appointment[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveCitasToStorage(citas: Appointment[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(CITAS_STORAGE_KEY, JSON.stringify(citas))
}

/** Sincroniza IndexedDB → localStorage (clave citas_dental). */
export async function syncCitasToLocalStorage(): Promise<Appointment[]> {
  const all = await db.appointments.orderBy('startTime').toArray()
  saveCitasToStorage(all)
  return all
}

export function renderCitas(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AGENDA_RENDER_EVENT))
}

/** Resuelve id real en IndexedDB (soporta id Dexie numérico o índice legacy en localStorage). */
async function resolveAppointmentId(idOrIndex: string | number): Promise<string | number | null> {
  if (typeof idOrIndex === 'string') {
    const byString = await db.appointments.get(idOrIndex)
    if (byString) return idOrIndex
    if (/^\d+$/.test(idOrIndex)) {
      const byNumber = await db.appointments.get(Number(idOrIndex))
      if (byNumber) return Number(idOrIndex)
    }
    return idOrIndex
  }

  const byPrimaryKey = await db.appointments.get(idOrIndex)
  if (byPrimaryKey) return idOrIndex

  const citas = getCitasFromStorage()
  const cita = citas[idOrIndex]
  return cita?.id ?? null
}

/**
 * Elimina una cita por id o índice del array en localStorage.
 * Pide confirmación y actualiza la interfaz vía renderCitas().
 */
export async function eliminarCita(idOrIndex: string | number): Promise<boolean> {
  const confirmed = window.confirm(
    '¿Está seguro de que desea eliminar esta cita? Esta acción no se puede deshacer.',
  )
  if (!confirmed) return false

  const id = await resolveAppointmentId(idOrIndex)
  if (id == null) return false

  const existing = await db.appointments.get(id)
  if (!existing && typeof id === 'number') {
    const asString = await db.appointments.get(String(id))
    if (asString) {
      await db.appointments.delete(String(id))
      await syncCitasToLocalStorage()
      renderCitas()
      return true
    }
    return false
  }

  await db.appointments.delete(id)
  await syncCitasToLocalStorage()
  renderCitas()
  return true
}

/**
 * Carga los datos de la cita en el formulario para reprogramar (sin guardar aún).
 */
export function reasignarCita(idOrIndex: string | number): void {
  void (async () => {
    const id = await resolveAppointmentId(idOrIndex)
    if (id == null) return

    window.dispatchEvent(
      new CustomEvent(AGENDA_REASIGNAR_EVENT, {
        detail: { id: String(id) },
      }),
    )
  })()
}

/**
 * Actualiza una cita existente en IndexedDB y localStorage (sin duplicar).
 */
export async function guardarCitaReasignada(
  id: string | number,
  input: CreateAppointmentInput,
): Promise<void> {
  const existing = await db.appointments.get(id)
  if (!existing) throw new Error('Cita no encontrada')

  await db.appointments.update(id, {
    ...input,
    status: existing.status,
    updatedAt: new Date().toISOString(),
  })

  await syncCitasToLocalStorage()
  renderCitas()
}

export function setupAgendaAppGlobals(): void {
  if (typeof window === 'undefined') return

  const win = window as Window & {
    eliminarCita?: typeof eliminarCita
    reasignarCita?: typeof reasignarCita
    renderCitas?: typeof renderCitas
    getCitasDental?: typeof getCitasFromStorage
  }

  win.eliminarCita = eliminarCita
  win.reasignarCita = reasignarCita
  win.renderCitas = renderCitas
  win.getCitasDental = getCitasFromStorage
}
