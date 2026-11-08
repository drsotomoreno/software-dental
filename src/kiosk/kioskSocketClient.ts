/**
 * Cliente Socket.IO del kiosco.
 * Prohibido importar @/db/*, Dexie, Auth o servicios clínicos.
 */
import { io, type Socket } from 'socket.io-client'
import { compressSignatureDataUrl } from './compressSignature'
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
    // el usuario ve timeout al enviar la firma.
    transports: ['polling', 'websocket'],
    upgrade: true,
    withCredentials: true,
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

function waitUntilConnected(socket: KioskSocket, timeoutMs = 12_000): Promise<boolean> {
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
    if (!socket.active || !socket.connected) {
      socket.connect()
    }
  })
}

function kioskTokenFromSocket(socket: KioskSocket): string {
  const auth = socket.auth
  if (auth && typeof auth === 'object' && 'token' in auth) {
    return String((auth as { token?: string }).token || '').trim()
  }
  return ''
}

async function submitSignatureHttp(
  payload: KioskSubmitSignatureInput,
  token: string,
): Promise<{ ok: boolean; message?: string; received?: KioskSignatureReceived }> {
  const origin = resolveSocketOrigin()
  const response = await fetch(`${origin}/api/v1/kiosk/signature`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })

  let data: {
    success?: boolean
    error?: string
    message?: string
    data?: Partial<KioskSignatureReceived> & { savedId?: string }
  } = {}
  try {
    data = (await response.json()) as typeof data
  } catch {
    /* ignore */
  }

  if (!response.ok || !data.success) {
    return {
      ok: false,
      message: data.error || data.message || `HTTP ${response.status}: no se pudo guardar la firma.`,
    }
  }

  return {
    ok: true,
    received: {
      documentType: payload.documentType,
      documentId: data.data?.documentId ?? payload.documentId ?? null,
      patientId: data.data?.patientId ?? payload.patientId ?? null,
      signatureBase64: payload.signatureBase64,
      formData: data.data?.formData ?? payload.formData,
      savedId: data.data?.savedId,
      createdAt: data.data?.createdAt,
      intake: (data.data as { intake?: KioskSignatureReceived['intake'] } | undefined)?.intake,
    },
  }
}

export async function submitKioskSignature(
  socket: KioskSocket,
  payload: KioskSubmitSignatureInput,
): Promise<{ ok: boolean; message?: string; received?: KioskSignatureReceived }> {
  const compressed = await compressSignatureDataUrl(payload.signatureBase64)
  const body: KioskSubmitSignatureInput = {
    ...payload,
    signatureBase64: compressed,
  }
  const token = kioskTokenFromSocket(socket)

  const online = await waitUntilConnected(socket, 8_000)
  if (online) {
    const socketResult = await new Promise<{
      ok: boolean
      message?: string
      received?: KioskSignatureReceived
    }>((resolve) => {
      // Ack liviano en el servidor: 12s basta si no reenvían la PNG.
      socket.timeout(12_000).emit(
        'kiosk:submit_signature',
        body,
        (err: Error | null, response?: {
          ok?: boolean
          message?: string
          received?: KioskSignatureReceived
        }) => {
          if (err) {
            resolve({
              ok: false,
              message: err.message || 'operation has timed out',
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

    if (socketResult.ok) {
      return {
        ...socketResult,
        received: socketResult.received
          ? {
              ...socketResult.received,
              signatureBase64:
                socketResult.received.signatureBase64 || body.signatureBase64,
            }
          : undefined,
      }
    }

    // Timeout / transporte: caer a HTTP (más fiable con firmas grandes).
    if (token && /timeout|disconnect|transport|xhr|websocket|operation has timed out/i.test(
      String(socketResult.message || ''),
    )) {
      console.warn('[Kiosco] Socket timeout → respaldo HTTP', socketResult.message)
      try {
        return await submitSignatureHttp(body, token)
      } catch (error) {
        return {
          ok: false,
          message:
            error instanceof Error
              ? error.message
              : 'Sin conexión. Verifique la red e intente otra vez.',
        }
      }
    }

    if (socketResult.message) return socketResult
  }

  if (!token) {
    return {
      ok: false,
      message:
        'Sin conexión con el servidor. Verifique Wi-Fi o recargue el enlace de la tableta.',
    }
  }

  try {
    console.warn('[Kiosco] Socket offline → respaldo HTTP')
    return await submitSignatureHttp(body, token)
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : 'Sin conexión. Verifique la red e intente otra vez.',
    }
  }
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
