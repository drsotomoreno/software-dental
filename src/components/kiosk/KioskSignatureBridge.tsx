import { useEffect } from 'react'
import type { Socket } from 'socket.io-client'
import { applyKioskSignature } from '@/services/kioskSignatureApply'
import {
  getClinicKioskSocket,
  onClinicKioskSignatureReceived,
} from '@/services/clinicKioskSocket'

/**
 * Escucha `kiosk:signature_received` en la app clínica y lo graba
 * en Dexie. El kiosco no importa este módulo.
 */
export function KioskSignatureBridge() {
  useEffect(() => {
    let stop = () => {}
    let bound: Socket | null = null

    const bind = () => {
      const socket = getClinicKioskSocket()
      if (socket === bound) return
      stop()
      bound = socket
      if (!socket) {
        stop = () => {}
        return
      }
      stop = onClinicKioskSignatureReceived((event) => {
        void applyKioskSignature(event).catch((error) => {
          console.error('No se pudo guardar la firma del kiosco en la historia:', error)
        })
      })
    }

    bind()
    const timer = window.setInterval(bind, 2000)
    return () => {
      window.clearInterval(timer)
      stop()
    }
  }, [])

  return null
}
