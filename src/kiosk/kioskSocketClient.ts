/**
 * Cliente Socket.IO del kiosco.
 * Prohibido importar @/db/*, Dexie, Auth o servicios clínicos.
 */
import { io, type Socket } from 'socket.io-client'
import type {
  KioskActionType,
  KioskCancelledEvent,
  KioskSignatureReceived,
  KioskSubmitSignatureInput,
  KioskTriggerEvent,
} from './kioskTypes'

export type KioskSocket = Socket

export function connectKioskSocket(input: {
  token: string
  clinicName?: string
}): KioskSocket {
  const socket = io({
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    auth: {
      token: input.token,
      mode: 'kiosk',
      clinicName: input.clinicName || '',
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
  })
  return socket
}

export function onKioskTrigger(
  socket: KioskSocket,
  handler: (event: KioskTriggerEvent) => void,
): () => void {
  const listener = (event: KioskTriggerEvent) => handler(event)
  socket.on('kiosk:trigger_action', listener)
  return () => {
    socket.off('kiosk:trigger_action', listener)
  }
}

function waitUntilConnected(socket: KioskSocket, timeoutMs = 15_000): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true)
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      cleanup()
      resolve(false)
    }, timeoutMs)
    const onConnect = () => {
      cleanup()
      resolve(true)
    }
    const cleanup = () => {
      window.clearTimeout(timer)
      socket.off('connect', onConnect)
    }
    socket.on('connect', onConnect)
    if (!socket.active) socket.connect()
  })
}

export async function submitKioskSignature(
  socket: KioskSocket,
  payload: KioskSubmitSignatureInput,
): Promise<{ ok: boolean; message?: string; received?: KioskSignatureReceived }> {
  const online = await waitUntilConnected(socket)
  if (!online) {
    return { ok: false, message: 'Sin conexión con la clínica. Reintentando…' }
  }

  return new Promise((resolve) => {
    socket.timeout(20_000).emit('kiosk:submit_signature', payload, (err: Error | null, response?: {
      ok?: boolean
      message?: string
      received?: KioskSignatureReceived
    }) => {
      if (err) {
        resolve({ ok: false, message: err.message || 'Tiempo de espera agotado al enviar la firma.' })
        return
      }
      resolve({
        ok: Boolean(response?.ok),
        message: response?.message,
        received: response?.received,
      })
    })
  })
}

export function emitKioskCancelled(
  socket: KioskSocket,
  input: {
    actionType: KioskActionType
    documentId?: string
    patientId?: string
    reason?: KioskCancelledEvent['reason']
  },
): void {
  const event: KioskCancelledEvent = {
    actionType: input.actionType,
    documentId: input.documentId,
    patientId: input.patientId,
    reason: input.reason || 'inactivity',
    cancelledAt: new Date().toISOString(),
  }
  if (!socket.connected) {
    socket.once('connect', () => {
      socket.emit('kiosk:cancelled', event)
    })
    if (!socket.active) socket.connect()
    return
  }
  socket.emit('kiosk:cancelled', event)
}
