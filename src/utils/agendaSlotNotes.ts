import type { AgendaSlotRef } from '@/utils/agendaSlotSelection'
import { slotKey } from '@/utils/agendaSlotSelection'

export const AGENDA_SLOT_NOTES_EVENT = 'agenda:slot-notes'

export interface AgendaSlotNote {
  date: string
  columnId: string
  startTime: string
  text: string
}

const STORAGE_KEY = 'agenda-slot-notes-v1'

function notify(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AGENDA_SLOT_NOTES_EVENT))
}

export function readSlotNotes(): AgendaSlotNote[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as AgendaSlotNote[]
    return Array.isArray(parsed) ? parsed.filter((note) => note?.text?.trim()) : []
  } catch {
    return []
  }
}

export function noteTextForSlot(notes: AgendaSlotNote[], slot: AgendaSlotRef): string {
  return notes.find(
    (note) =>
      note.date === slot.date &&
      note.columnId === slot.columnId &&
      note.startTime === slot.startTime,
  )?.text ?? ''
}

/** Guarda el mismo texto en cada casilla. Un texto vacío quita la nota. */
export function writeSlotNotes(slots: AgendaSlotRef[], text: string): void {
  const trimmed = text.trim()
  const keys = new Set(slots.map((slot) => slotKey(slot)))
  const remaining = readSlotNotes().filter((note) => !keys.has(slotKey(note)))
  const next = trimmed
    ? [
        ...remaining,
        ...slots.map((slot) => ({
          date: slot.date,
          columnId: slot.columnId,
          startTime: slot.startTime,
          text: trimmed,
        })),
      ]
    : remaining
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  notify()
}
