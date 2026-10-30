import { Server } from 'socket.io'
import { config } from '../config.js'
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

async function authenticateSocket(socket) {
  const token = extractToken(socket)
  if (!token) {
    const error = new Error('Falta el token de autenticación.')
    error.data = { code: 'AUTH_REQUIRED' }
    throw error
  }

  const modeHint = extractMode(socket)

  if (modeHint !== 'clinical') {
    try {
      const payload = verifyKioskToken(token)
      if (payload.role === 'kiosk' && payload.clinicId) {
        return {
          role: 'kiosk',
          clinicId: String(payload.clinicId).trim(),
          clinicName: String(socket.handshake.auth?.clinicName || '').trim(),
        }
      }
    } catch (error) {
      if (modeHint === 'kiosk') throw error
    }
  }

  const session = await resolveSubscriptionSession(token, sessionHintFromRequest({
    headers: socket.handshake.headers || {},
    query: socket.handshake.query || {},
    body: {},
  }))
  if (!session?.user) {
    const error = new Error('Sesión inválida o expirada.')
    error.data = { code: 'SESSION_INVALID' }
    throw error
  }
  const scope = clinicSyncAliasIds(session.user)
  if (!scope.canonical) {
    const error = new Error('La sesión no tiene clínica asociada.')
    error.data = { code: 'NO_CLINIC' }
    throw error
  }
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
    cors: {
      origin(origin, callback) {
        callback(null, corsOriginAllowed(origin))
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
  })

  io.use(async (socket, next) => {
    try {
      const identity = await authenticateSocket(socket)
      const room = clinicKioskRoom(identity.clinicId)
      if (!room) {
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
    void socket.join(room)
    socket.emit('kiosk:ready', {
      role: identity.role,
      clinicId: identity.clinicId,
      clinicName: identity.clinicName || null,
      room,
    })

    socket.on('kiosk:trigger_action', (raw, ack) => {
      try {
        if (identity.role !== 'clinical') {
          const message = 'Solo la app clínica puede enviar acciones a la tableta.'
          if (typeof ack === 'function') ack({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const actionType = normalizeKioskActionType(body.actionType)
        const payload = body.payload && typeof body.payload === 'object' ? body.payload : {}
        if (!actionType) {
          const message = 'actionType inválido.'
          if (typeof ack === 'function') ack({ ok: false, message })
          return
        }
        const event = {
          actionType,
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
        if (typeof ack === 'function') ack({ ok: true, event })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'No se pudo enviar a la tableta.'
        if (typeof ack === 'function') ack({ ok: false, message })
      }
    })

    socket.on('kiosk:submit_signature', async (raw, ack) => {
      try {
        if (identity.role !== 'kiosk') {
          const message = 'Solo la tableta kiosco puede enviar firmas.'
          if (typeof ack === 'function') ack({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const documentType = normalizeKioskActionType(body.documentType || body.actionType)
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

        const received = {
          documentType: saved.documentType,
          documentId: saved.documentId,
          patientId: saved.patientId,
          signatureBase64: saved.signatureBase64,
          formData: saved.formData,
          savedId: saved.id,
          createdAt: saved.createdAt,
          intake: saved.intake,
        }
        io.to(room).emit('kiosk:signature_received', received)
        if (typeof ack === 'function') ack({ ok: true, received })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo guardar la firma del kiosco.'
        if (typeof ack === 'function') ack({ ok: false, message })
        socket.emit('kiosk:error', { message })
      }
    })

    socket.on('kiosk:cancelled', (raw, ack) => {
      try {
        if (identity.role !== 'kiosk') {
          const message = 'Solo la tableta kiosco puede cancelar una acción.'
          if (typeof ack === 'function') ack({ ok: false, message })
          return
        }
        const body = raw && typeof raw === 'object' ? raw : {}
        const actionType = normalizeKioskActionType(body.actionType)
        if (!actionType) {
          const message = 'actionType inválido.'
          if (typeof ack === 'function') ack({ ok: false, message })
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
        if (typeof ack === 'function') ack({ ok: true, event })
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'No se pudo notificar la cancelación.'
        if (typeof ack === 'function') ack({ ok: false, message })
      }
    })
  })

  console.log('[Kiosk Socket] Socket.IO listo en /socket.io (salas clinic_*)')
  return io
}

export function getKioskIo() {
  return io
}
