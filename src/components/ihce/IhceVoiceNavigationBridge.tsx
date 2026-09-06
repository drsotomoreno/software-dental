import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { IHCE_NAVIGATE_EVENT } from '@/types/ihce'

/** Escucha el trigger de voz y navega a la ficha del paciente. */
export function IhceVoiceNavigationBridge() {
  const navigate = useNavigate()

  useEffect(() => {
    const onNavigate = (event: Event) => {
      const patientId = (event as CustomEvent<{ patientId?: string }>).detail?.patientId
      if (!patientId) return
      navigate(`/pacientes/${encodeURIComponent(patientId)}`)
    }

    window.addEventListener(IHCE_NAVIGATE_EVENT, onNavigate)
    return () => window.removeEventListener(IHCE_NAVIGATE_EVENT, onNavigate)
  }, [navigate])

  return null
}
