import { useEffect, useState } from 'react'
import {
  AGENDA_CLIPBOARD_EVENT,
  getAgendaClipboard,
  type AgendaClipboardEntry,
} from '@/utils/agendaClipboard'

export function useAgendaClipboard() {
  const [clipboard, setClipboard] = useState<AgendaClipboardEntry | null>(() =>
    getAgendaClipboard(),
  )

  useEffect(() => {
    const refresh = () => setClipboard(getAgendaClipboard())
    window.addEventListener(AGENDA_CLIPBOARD_EVENT, refresh)
    return () => window.removeEventListener(AGENDA_CLIPBOARD_EVENT, refresh)
  }, [])

  return {
    clipboard,
    hasClipboard: clipboard !== null,
  }
}
