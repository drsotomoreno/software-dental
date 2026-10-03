export {
  AGENDA_CLIPBOARD_EVENT,
  clearAgendaClipboard,
  copiarCita,
  copiarCitas,
  cortarCita,
  cortarCitas,
  getAgendaClipboard,
  hasAgendaClipboard,
  pasteInputsForTarget,
  pegarCita,
  pegarCitasEn,
  setupAgendaClipboardGlobals,
} from '@/modules/agenda/storage/agendaClipboard'
export type {
  AgendaClipboardEntry,
  AgendaClipboardMode,
  PasteTarget,
} from '@/modules/agenda/storage/agendaClipboard'
