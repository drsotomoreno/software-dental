/**
 * Cliente Socket.IO del kiosco.
 * Prohibido importar @/db/*, Dexie, Auth o servicios clínicos.
 */
import { io, type Socket } from 'socket.io-client'
import { resolveSocketOrigin } from './socketOrigin'
import type {
  KioskActionType,
  KioskCancelledEvent,
  KioskSignatureReceived,
  KioskSubmitSignatureInput,
  KioskTriggerEvent,
} from './kioskTypes'

export type KioskSocket = Socket

type KioskAuthPayload = {
  token: string
  mode: 'kiosk'
  clinicName: string
}

function buildAuth(input: { token: string; clinicName?: string }): KioskAuthPayload {
  return {
    token: String(input.token || '').trim(),
    mode: 'kiosk',
    clinicName: input.clinicName || '',
  }
}

/**
 * Conecta la tableta. El origen sale de la URL actual (IP LAN o dominio).
 * El token se reinyecta en cada intento de reconexión vía `auth` callback.
 */
export function connectKioskSocket(input: {
  token: string
  clinicName?: string
}): KioskSocket {
  const origin = resolveSocketOrigin()
  const authPayload = buildAuth(input)

  const socket = io(origin || undefined, {
    path: '/socket.io',
    // Polling primero: en nginx sin Upgrade el websocket falla y
    // el usuario ve «Sin conexión» al enviar la firma.
    transports: ['polling', 'websocket'],
    upgrade: true,
    withCredentials: true,
    // Función: Socket.IO la vuelve a llamar en cada reconnect.
    auth: (cb: (data: KioskAuthPayload) => void) => {
      cb({ ...authPayload })
    },
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 800,
    reconnectionDelayMax: 5000,
    timeout: 20_000,
  })

  socket.on('reconnect_attempt', () => {
    // Refuerzo por si alguna versión no vuelve a pedir el callback auth.
    socket.auth = { ...authPayload }
  })

  if (typeof console !== 'undefined') {
    console.info('[Kiosco] Socket origen:', origin || '(mismo host)')
  }

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

function waitUntilConnected(socket: KioskSocket, timeoutMs = 20_000): Promise<boolean> {
  if (socket.connected) return Promise.resolve(true)

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      window.clearTimeout(timer)
      socket.off('connect', onConnect)
      socket.off('reconnect', onConnect)
      resolve(ok)
    }
    const timer = window.setTimeout(() => finish(false), timeoutMs)
    const onConnect = () => finish(true)
    socket.on('connect', onConnect)
    socket.on('reconnect', onConnect)
    // Fuerza un intento si el cliente quedó pausado tras un disconnect.
    if (!socket.active) {
      socket.connect()
    } else if (!socket.connected) {
      socket.connect()
    }
  })
}

export async function submitKioskSignature(
  socket: KioskSocket,
  payload: KioskSubmitSignatureInput,
): Promise<{ ok: boolean; message?: string; received?: KioskSignatureReceived }> {
  const online = await waitUntilConnected(socket)
  if (!online) {
    return {
      ok: false,
      message:
        'Sin conexión con el servidor. Verifique Wi-Fi o recargue el enlace de la tableta.',
    }
  }

  const emitOnce = () =>
    new Promise<{ ok: boolean; message?: string; received?: KioskSignatureReceived }>((resolve) => {
      socket.timeout(25_000).emit(
        'kiosk:submit_signature',
        payload,
        (err: Error | null, response?: {
          ok?: boolean
          message?: string
          received?: KioskSignatureReceived
        }) => {
          if (err) {
            resolve({
              ok: false,
              message: err.message || 'Tiempo de espera agotado al enviar la firma.',
            })
            return
          }
          resolve({
            ok: Boolean(response?.ok),
            message: response?.message,
            received: response?.received,
          })
        },
      )
    })

  let result = await emitOnce()
  // Un disconnect a mitad del emit: reintenta una vez tras reconectar.
  if (!result.ok && /timeout|disconnect|transport|xhr|websocket/i.test(String(result.message || ''))) {
    const reconnected = await waitUntilConnected(socket, 15_000)
    if (reconnected) {
      result = await emitOnce()
    }
  }
  return result
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
