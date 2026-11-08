import { Server } from 'socket.io'
import { config } from '../config.js'
import { isPrivateLanOrigin } from '../utils/localLanAddress.js'
import { verifyKioskToken } from '../utils/kioskJwt.js'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  normalizeKioskActionType,
  saveKioskSignature,
} from '../services/kioskSignature.service.js'

/** @type {import('socket.io').Server | null} */
let io = null

export function clinicKioskRoom(clinicId) {
  const raw = String(clinicId || '').trim()
  if (!raw) return ''
  const bare = raw.startsWith('clinic:') ? raw.slice('clinic:'.length) : raw
  return `clinic_${bare}`
}

function corsOriginAllowed(origin) {
  if (!origin) return true
  return (
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ||
    isPrivateLanOrigin(origin) ||
    origin === config.corsOrigin ||
    /^https:\/\/([a-z0-9-]+\.)?mihistoriadental\.com$/.test(origin)
  )
}

function extractToken(socket) {
  const auth = socket.handshake.auth && typeof socket.handshake.auth === 'object'
    ? socket.handshake.auth
    : {}
  const query = socket.handshake.query && typeof socket.handshake.query === 'object'
    ? socket.handshake.query
    : {}
  const header = socket.handshake.headers?.authorization
  if (typeof auth.token === 'string' && auth.token.trim()) return auth.token.trim()
  if (typeof query.token === 'string' && query.token.trim()) return query.token.trim()
  if (typeof header === 'string' && header.startsWith('Bearer ')) {
    return header.slice(7).trim()
  }
  return ''
}

function clientIpAddress(socket) {
  const forwarded = socket.handshake.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return String(forwarded[0]).split(',')[0].trim()
  }
  return String(socket.handshake.address || '').trim()
}

function asIsoTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const parsed = new Date(value || Date.now())
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function extractMode(socket) {
  const auth = socket.handshake.auth && typeof socket.handshake.auth === 'object'
    ? socket.handshake.auth
    : {}
  const query = socket.handshake.query && typeof socket.handshake.query === 'object'
    ? socket.handshake.query
    : {}
  const raw = String(auth.mode || query.mode || '').trim().toLowerCase()
  if (raw === 'kiosk' || raw === 'clinical') return raw
  return ''
}

function logKiosk(level, message, detail) {
  const prefix = '[Kiosco]'
  if (detail !== undefined) {
    console[level](prefix, message, detail)
  } else {
    console[level](prefix, message)
  }
}

async function authenticateSocket(socket) {
  const token = extractToken(socket)
  const modeHint = extractMode(socket)
  const origin = socket.handshake.headers?.origin || ''
  const ip = clientIpAddress(socket)

  if (!token) {
    logKiosk('warn', `AUTH rechazado (sin token) mode=${modeHint || '?'} ip=${ip} origin=${origin}`)
    const error = new Error('Falta el token de autenticación.')
    error.data = { code: 'AUTH_REQUIRED' }
    throw error
  }

  if (modeHint !== 'clinical') {
    try {
      const payload = verifyKioskToken(token)
      if (payload.role === 'kiosk' && payload.clinicId) {
        logKiosk(
          'info',
          `AUTH ok kiosk clinicId=${payload.clinicId} ip=${ip} origin=${origin || '(sin origin)'}`,
        )
        return {
          role: 'kiosk',
          clinicId: String(payload.clinicId).trim(),
          clinicName: String(socket.handshake.auth?.clinicName || '').trim(),
        }
      }
    } catch (error) {
      logKiosk(
        'warn',
        `AUTH kiosk JWT falló: ${error instanceof Error ? error.message : error} mode=${modeHint || '?'} ip=${ip}`,
      )
      if (modeHint === 'kiosk') throw error
    }
  }

  const session = await resolveSubscriptionSession(token, sessionHintFromRequest({
    headers: socket.handshake.headers || {},
    query: socket.handshake.query || {},
    body: {},
  }))
  if (!session?.user) {
    logKiosk('warn', `AUTH sesión clínica inválida mode=${modeHint || '?'} ip=${ip}`)
    const error = new Error('Sesión inválida o expirada.')
    error.data = { code: 'SESSION_INVALID' }
    throw error
  }
  const scope = clinicSyncAliasIds(session.user)
  if (!scope.canonical) {
    logKiosk('warn', `AUTH sin clínica user=${session.user.id || '?'}`)
    const error = new Error('La sesión no tiene clínica asociada.')
    error.data = { code: 'NO_CLINIC' }
    throw error
  }
  logKiosk(
    'info',
    `AUTH ok clinical user=${session.user.id || '?'} clinicId=${scope.canonical} ip=${ip}`,
  )
  return {
    role: 'clinical',
    clinicId: scope.canonical,
    clinicName: String(session.user.clinicName || session.user.legalName || '').trim(),
    userId: String(session.user.id || ''),
  }
}

/**
 * Adjunta Socket.IO al servidor HTTP de Express.
 * Salas: clinic_${clinicId}. Eventos: kiosk:trigger_action, kiosk:submit_signature.
 */
export function attachKioskSocket(httpServer) {
  if (io) return io

  io = new Server(httpServer, {
    path: '/socket.io',
    // Firmas PNG en tabletas retina + formData superan el default 1 MB.
    maxHttpBufferSize: 12 * 1024 * 1024,
    pingInterval: 20_000,
    pingTimeout: 25_000,
    cors: {
      origin(origin, callback) {
        const allowed = corsOriginAllowed(origin)
        if (!allowed) {
          logKiosk('warn', `CORS rechazado origin=${origin}`)
        }
        callback(null, allowed)
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    allowEIO3: true,
  })

  io.engine.on('connection_error', (error) => {
    logKiosk('warn', `Engine connection_error: ${error?.message || error}`, {
      code: error?.code,
      context: error?.context,
    })
  })

  io.use(async (socket, next) => {
    try {
      const identity = await authenticateSocket(socket)
      const room = clinicKioskRoom(identity.clinicId)
      if (!room) {
        logKiosk('warn', 'AUTH clinicId inválido → sala vacía')
        return next(new Error('clinicId inválido.'))
      }
      socket.data.identity = identity
      socket.data.room = room
      next()
    } catch (error) {
      next(error instanceof Error ? error : new Error('Autenticación de socket fallida.'))
    }
  })

  io.on('connection', (socket) => {
    const { identity, room } = socket.data
    const transport = socket.conn?.transport?.name || '?'
    void socket.join(room)

    logKiosk(
      'info',
      `CONECTADO id=${socket.id} role=${identity.role} room=${room} transport=${transport} ip=${clientIpAddress(socket)}`,
    )

    socket.emit('kiosk:ready', {
      role: identity.role,
      clinicId: identity.clinicId,
      clinicName: identity.clinicName || null,
      room,
    })

    socket.conn?.on?.('upgrade', (upgraded) => {
      logKiosk(
        'info',
        `UPGRADE id=${socket.id} → ${upgraded?.name || socket.conn?.transport?.name || 'websocket'}`,
      )
    })

    socket.on('disconnect', (reason) => {
      logKiosk(
        'info',
        `DESCONECTADO id=${socket.id} role=${identity.role} room=${room} reason=${reason}`,
      )
    })

    socket.on('kiosk:trigger_action', async (raw, ack) => {
      const respond = (payload) => {
        if (typeof ack === 'function') ack(payload)
      }
      try {
        if (identity.role !== 'clinical') {
          const message = 'Solo la app clínica puede enviar acciones a la tableta.'
          logKiosk('warn', `RECHAZO trigger_action id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const actionType = normalizeKioskActionType(body.actionType)
        const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
        if (!actionType) {
          const message = 'actionType inválido.'
          logKiosk('warn', `RECHAZO trigger_action id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }
        const roomSockets = await io.in(room).fetchSockets()
        const kioskCount = roomSockets.filter((peer) => peer.data?.identity?.role === 'kiosk').length
        if (kioskCount === 0) {
          const message =
            'No hay una tableta conectada en esta clínica. Abra el QR de «Tableta» en la tablet y vuelva a enviar.'
          logKiosk('warn', `RECHAZO trigger_action ${actionType} room=${room}: sin tabletas`)
          respond({ ok: false, message })
          return
        }
        const event = {
          actionType,
          // Resolución 1995: la evolución no se firma en la tableta.
          patientMaySign: actionType !== 'EVOLUTION',
          payload: {
            documentId: payload.documentId != null ? String(payload.documentId) : '',
            patientId: payload.patientId != null ? String(payload.patientId) : '',
            title: payload.title != null ? String(payload.title) : '',
            contentText: payload.contentText != null ? String(payload.contentText) : '',
            formData:
              payload.formData && typeof payload.formData === 'object' ? payload.formData : {},
          },
          sentAt: new Date().toISOString(),
          fromUserId: identity.userId || null,
        }
        socket.to(room).emit('kiosk:trigger_action', event)
        logKiosk(
          'info',
          `EMIT trigger_action ${actionType} → ${kioskCount} tableta(s) room=${room} from=${identity.userId || '?'}`,
        )
        respond({ ok: true, event })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo enviar a la tableta.'
        logKiosk('error', `ERROR trigger_action id=${socket.id}: ${message}`)
        respond({ ok: false, message })
      }
    })

    socket.on('kiosk:submit_signature', async (raw, ack) => {
      const respond = (payload) => {
        if (typeof ack === 'function') ack(payload)
      }
      try {
        if (identity.role !== 'kiosk') {
          const message = 'Solo la tableta kiosco puede enviar firmas.'
          logKiosk('warn', `RECHAZO submit_signature id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const documentType = normalizeKioskActionType(body.documentType || body.actionType)
        const sigLen = String(body.signatureBase64 || '').length
        logKiosk(
          'info',
          `RECV submit_signature id=${socket.id} type=${documentType || '?'} bytes≈${sigLen} room=${room}`,
        )

        if (!documentType) {
          const message = 'documentType inválido.'
          logKiosk('warn', `RECHAZO submit_signature id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }

        const saved = await saveKioskSignature({
          clinicId: identity.clinicId,
          documentType,
          documentId: body.documentId,
          patientId: body.patientId,
          title: body.title,
          contentText: body.contentText,
          signatureBase64: body.signatureBase64,
          formData: body.formData,
        })

        // Ack liviano YA: si devolvemos la PNG completa el timeout del cliente
        // salta ("operation has timed out") aunque el guardado haya ido bien.
        respond({
          ok: true,
          received: {
            documentType: saved.documentType,
            documentId: saved.documentId,
            patientId: saved.patientId,
            savedId: saved.id,
            createdAt: saved.createdAt,
            signedAt: asIsoTimestamp(saved.createdAt),
            formData: saved.formData,
            intake: saved.intake,
            signatureBase64: '',
          },
        })
        logKiosk(
          'info',
          `OK submit_signature id=${socket.id} savedId=${saved.id} type=${saved.documentType} room=${room}`,
        )

        const received = {
          documentType: saved.documentType,
          documentId: saved.documentId,
          patientId: saved.patientId,
          signatureBase64: saved.signatureBase64,
          formData: saved.formData,
          savedId: saved.id,
          createdAt: saved.createdAt,
          signedAt: asIsoTimestamp(saved.createdAt),
          ipAddress: clientIpAddress(socket),
          kioskDeviceId: String(socket.id || ''),
          intake: saved.intake,
        }
        io.to(room).emit('kiosk:signature_received', received)
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo guardar la firma del kiosco.'
        logKiosk('error', `ERROR submit_signature id=${socket.id}: ${message}`)
        respond({ ok: false, message })
        socket.emit('kiosk:error', { message })
      }
    })

    socket.on('kiosk:cancelled', (raw, ack) => {
      const respond = (payload) => {
        if (typeof ack === 'function') ack(payload)
      }
      try {
        if (identity.role !== 'kiosk') {
          const message = 'Solo la tableta kiosco puede cancelar una acción.'
          logKiosk('warn', `RECHAZO cancelled id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const actionType = normalizeKioskActionType(body.actionType)
        if (!actionType) {
          const message = 'actionType inválido.'
          logKiosk('warn', `RECHAZO cancelled id=${socket.id}: ${message}`)
          respond({ ok: false, message })
          return
        }
        const event = {
          actionType,
          documentId: body.documentId != null ? String(body.documentId) : '',
          patientId: body.patientId != null ? String(body.patientId) : '',
          reason: body.reason != null ? String(body.reason) : 'inactivity',
          cancelledAt:
            body.cancelledAt != null ? String(body.cancelledAt) : new Date().toISOString(),
        }
        socket.to(room).emit('kiosk:cancelled', event)
        logKiosk(
          'info',
          `EMIT cancelled ${actionType} reason=${event.reason} room=${room} id=${socket.id}`,
        )
        respond({ ok: true, event })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo notificar la cancelación.'
        logKiosk('error', `ERROR cancelled id=${socket.id}: ${message}`)
        respond({ ok: false, message })
      }
    })
  })

  console.log('[Kiosk Socket] Socket.IO listo en /socket.io (salas clinic_*, buffer 12MB, CORS LAN+dominio)')
  return io
}

export function getKioskIo() {
  return io
}
