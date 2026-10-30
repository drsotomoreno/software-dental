/**
 * Socket de la app clínica (PC) hacia la sala de la clínica.
 * Usa el token de suscripción; no pertenece al chunk del kiosco.
 */
import { io, type Socket } from 'socket.io-client'
import { getStoredApiAuth } from '@/services/apiAuthService'
import type {
  KioskActionType,
  KioskCancelledEvent,
  KioskSignatureReceived,
  KioskTriggerPayload,
} from '@/kiosk/kioskTypes'

let clinicalSocket: Socket | null = null
let connectingToken: string | null = null

export function getClinicKioskSocket(): Socket | null {
  const auth = getStoredApiAuth()
  const token = auth?.token?.trim()
  if (!token) {
    disconnectClinicKioskSocket()
    return null
  }

  if (clinicalSocket?.connected && connectingToken === token) {
    return clinicalSocket
  }

  if (clinicalSocket && connectingToken !== token) {
    clinicalSocket.disconnect()
    clinicalSocket = null
  }

  connectingToken = token
  clinicalSocket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: { token, mode: 'clinical' },
    autoConnect: true,
    reconnection: true,
  })

  return clinicalSocket
}

export function disconnectClinicKioskSocket() {
  if (clinicalSocket) {
    clinicalSocket.disconnect()
    clinicalSocket = null
  }
  connectingToken = null
}

export function emitKioskTriggerAction(input: {
  actionType: KioskActionType
  payload: KioskTriggerPayload
}): Promise<{ ok: boolean; message?: string }> {
  const socket = getClinicKioskSocket()
  if (!socket) {
    return Promise.resolve({
      ok: false,
      message: 'Inicie sesión para enviar documentos a la tableta.',
    })
  }

  return new Promise((resolve) => {
    const send = () => {
      socket.timeout(12_000).emit(
        'kiosk:trigger_action',
        {
          actionType: input.actionType,
          payload: input.payload,
        },
        (err: Error | null, response?: { ok?: boolean; message?: string }) => {
          if (err) {
            resolve({ ok: false, message: err.message || 'No hay respuesta del servidor.' })
            return
          }
          resolve({ ok: Boolean(response?.ok), message: response?.message })
        },
      )
    }

    if (socket.connected) {
      send()
      return
    }
    socket.once('connect', send)
    socket.once('connect_error', (error) => {
      resolve({ ok: false, message: error.message || 'No se pudo conectar con la tableta.' })
    })
    if (!socket.active) socket.connect()
  })
}

export function onClinicKioskSignatureReceived(
  handler: (event: KioskSignatureReceived) => void,
): () => void {
  const socket = getClinicKioskSocket()
  if (!socket) return () => undefined

  const listener = (event: KioskSignatureReceived) => handler(event)
  socket.on('kiosk:signature_received', listener)
  return () => {
    socket.off('kiosk:signature_received', listener)
  }
}

export function onClinicKioskCancelled(
  handler: (event: KioskCancelledEvent) => void,
): () => void {
  const socket = getClinicKioskSocket()
  if (!socket) return () => undefined

  const listener = (event: KioskCancelledEvent) => handler(event)
  socket.on('kiosk:cancelled', listener)
  return () => {
    socket.off('kiosk:cancelled', listener)
  }
}
