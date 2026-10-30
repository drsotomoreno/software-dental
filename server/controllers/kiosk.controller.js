import { saveKioskIntake } from '../services/kiosk.service.js'

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null
}

function normalizeDatosBasicos(body) {
  const nested = asObject(body.datosBasicos) || asObject(body.datos_basicos)
  if (nested) {
    return {
      firstName: String(nested.firstName || nested.nombres || '').trim(),
      lastName: String(nested.lastName || nested.apellidos || '').trim(),
      documentType: String(nested.documentType || nested.tipoDocumento || 'CC').trim().toUpperCase(),
      documentNumber: String(nested.documentNumber || nested.numeroDocumento || '').trim(),
      phone: String(nested.phone || nested.telefono || '').trim(),
    }
  }

  return {
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    documentType: String(body.documentType || 'CC').trim().toUpperCase(),
    documentNumber: String(body.documentNumber || '').trim(),
    phone: String(body.phone || '').trim(),
  }
}

function normalizeAnamnesis(body) {
  const raw = asObject(body.anamnesis) || {}
  return {
    allergicToMedication: Boolean(raw.allergicToMedication),
    hasHypertension: Boolean(raw.hasHypertension),
    hasDiabetes: Boolean(raw.hasDiabetes),
    takesAnticoagulants: Boolean(raw.takesAnticoagulants),
  }
}

function validateIntake({ datosBasicos, signatureBase64 }) {
  const missing = []
  if (!datosBasicos.firstName) missing.push('datosBasicos.firstName')
  if (!datosBasicos.lastName) missing.push('datosBasicos.lastName')
  if (!datosBasicos.documentType) missing.push('datosBasicos.documentType')
  if (!datosBasicos.documentNumber) missing.push('datosBasicos.documentNumber')
  if (!datosBasicos.phone) missing.push('datosBasicos.phone')
  if (!signatureBase64) missing.push('signatureBase64')
  return missing
}

/**
 * POST /api/v1/kiosk/intake
 */
export async function createKioskIntake(req, res, next) {
  try {
    const body = asObject(req.body) || {}
    const clinicId = String(req.clinicId || req.kiosk?.clinicId || '').trim()
    const datosBasicos = normalizeDatosBasicos(body)
    const anamnesis = normalizeAnamnesis(body)
    const signatureBase64 = String(body.signatureBase64 || body.signature || '').trim()

    const missing = validateIntake({ datosBasicos, signatureBase64 })
    if (missing.length) {
      return res.status(400).json({
        success: false,
        error: 'Payload incompleto',
        message: `Faltan campos requeridos: ${missing.join(', ')}`,
        missing,
      })
    }

    if (!signatureBase64.startsWith('data:image/') && signatureBase64.length < 32) {
      return res.status(400).json({
        success: false,
        error: 'Firma inválida',
        message: 'signatureBase64 debe ser una imagen Base64 válida.',
      })
    }

    const saved = await saveKioskIntake({
      clinicId,
      datosBasicos,
      anamnesis,
      signatureBase64,
    })

    return res.status(201).json({
      success: true,
      message: 'Registro de kiosco guardado correctamente.',
      data: {
        id: saved.id,
        syncId: saved.syncId,
        clinicId: saved.clinicId,
        createdAt: saved.createdAt,
      },
    })
  } catch (error) {
    if (error?.status && error.status < 500) {
      return res.status(error.status).json({
        success: false,
        error: error.message || 'Error en el registro de kiosco',
        code: error.code,
      })
    }
    return next(error)
  }
}
