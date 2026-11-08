import {
  normalizeKioskActionType,
  saveKioskSignature,
} from '../services/kioskSignature.service.js'
import { clinicKioskRoom, getKioskIo } from '../socket/kioskSocket.js'

function asIsoTimestamp(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString()
  const parsed = new Date(value || Date.now())
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString()
}

function clientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for']
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim()
  }
  return String(req.socket?.remoteAddress || '').trim()
}

/**
 * POST /api/v1/kiosk/signature
 * Respaldo HTTP cuando el ack de Socket.IO hace timeout (firmas grandes / nginx).
 * Guarda en Postgres y notifica a la sala clínica por Socket.IO.
 */
export async function createKioskSignature(req, res, next) {
  try {
    const clinicId = String(req.clinicId || req.kiosk?.clinicId || '').trim()
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const documentType = normalizeKioskActionType(body.documentType || body.actionType)

    if (!clinicId) {
      return res.status(401).json({ success: false, error: 'Token de kiosco sin clínica.' })
    }
    if (!documentType) {
      return res.status(400).json({ success: false, error: 'documentType inválido.' })
    }

    console.log(
      `[Kiosco] HTTP submit_signature type=${documentType} clinic=${clinicId} bytes≈${String(body.signatureBase64 || '').length}`,
    )

    const saved = await saveKioskSignature({
      clinicId,
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
      signedAt: asIsoTimestamp(saved.createdAt),
      ipAddress: clientIp(req),
      kioskDeviceId: 'http-fallback',
      intake: saved.intake,
    }

    const io = getKioskIo()
    const room = clinicKioskRoom(clinicId)
    if (io && room) {
      io.to(room).emit('kiosk:signature_received', received)
      console.log(`[Kiosco] HTTP → emit signature_received room=${room} savedId=${saved.id}`)
    } else {
      console.warn('[Kiosco] HTTP guardó la firma pero Socket.IO no está listo para notificar al PC.')
    }

    return res.status(201).json({
      success: true,
      message: 'Firma registrada.',
      data: {
        savedId: saved.id,
        documentType: saved.documentType,
        documentId: saved.documentId,
        patientId: saved.patientId,
        createdAt: saved.createdAt,
        formData: saved.formData,
        intake: saved.intake,
      },
    })
  } catch (error) {
    if (error?.status) {
      return res.status(error.status).json({
        success: false,
        error: error.message || 'No se pudo guardar la firma.',
        code: error.code,
      })
    }
    return next(error)
  }
}
