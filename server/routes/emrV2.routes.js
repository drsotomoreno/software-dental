/**
 * EMR v2 — mutaciones granulares Server-First ACID.
 * Montaje: app.use('/api/v2', emrV2Routes)
 * No reemplaza /api/sync ni /api/patients (legacy intacto).
 */
import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import { clinicKeyInScope, clinicSyncAliasIds } from '../../shared/clinicalSyncScope.js'
import {
  ALLOWED_CLINICAL_SECTIONS,
  createOrLockEvolution,
  getEmrV2AuditTrail,
  getOrMigrateEmrV2Chart,
  mutateLockedEvolutionForbidden,
  upsertClinicalBaseSection,
} from '../services/emrV2Store.js'
import {
  persistClinicalAsset,
  readClinicalAssetContent,
  rejectHeavyBase64InJson,
} from '../services/emrV2AssetStore.js'
import { emitEmrV2PatientUpdated } from '../services/emrV2Realtime.js'

const router = Router()
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
})

const sectionSchema = z.enum([
  'anamnesis',
  'examen_estomatologico',
  'odontograma',
  'diagnosticos',
  'plan_tratamiento',
])

const patchBodySchema = z.object({
  payload: z.unknown(),
  expectedVersion: z.coerce.number().int().positive(),
})

const evolutionBodySchema = z.object({
  contenido: z.unknown().optional(),
  profesional_id: z.string().optional(),
  profesionalId: z.string().optional(),
  profesional_nombre: z.string().optional(),
  profesionalNombre: z.string().optional(),
  rethus: z.string().optional(),
  fecha_atencion: z.string().optional(),
  fechaAtencion: z.string().optional(),
  parent_evolution_id: z.string().uuid().optional().nullable(),
  parentEvolutionId: z.string().uuid().optional().nullable(),
  lockNow: z.boolean().optional(),
})

function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return
  return res.status(status).json(body)
}

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function tenantIdFromRequest(req) {
  const query = req.query && typeof req.query === 'object' ? req.query : {}
  const body = req.body && typeof req.body === 'object' ? req.body : {}
  return String(
    query.tenant_id ||
      query.clinicId ||
      body.clinicId ||
      body.clinica_id ||
      req.headers['x-clinic-id'] ||
      '',
  ).trim()
}

async function requireClinicSession(req, res) {
  const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
  if (!session?.user) {
    sendJson(res, 401, { success: false, ok: false, error: 'Sesión inválida o expirada.' })
    return null
  }
  const scope = clinicSyncAliasIds(session.user)
  if (!scope.canonical) {
    sendJson(res, 400, { success: false, ok: false, error: 'La sesión no tiene clínica asociada.' })
    return null
  }
  const requested = tenantIdFromRequest(req)
  if (requested && !clinicKeyInScope(requested, scope.canonical, scope.aliases)) {
    sendJson(res, 403, {
      success: false,
      ok: false,
      error: 'Violación de seguridad. No tienes permisos para acceder a los datos de esta sede.',
    })
    return null
  }
  const tier = session.accessTier
  if (tier !== 'full' && tier !== 'trial') {
    sendJson(res, 402, {
      success: false,
      ok: false,
      error: 'Sin suscripción pagada no puede consultar historias clínicas.',
      requiresSubscription: true,
    })
    return null
  }
  return { session, ...scope }
}

function actorFromAuth(auth) {
  const user = auth?.session?.user || {}
  return {
    email: String(user.email || '').trim(),
    rethus: String(user.rethus || user.rethusNumber || '').trim(),
    id: String(user.id || '').trim(),
    nombre: String(user.nombre || user.name || user.fullName || '').trim(),
  }
}

function patientSyncIdOf(chartPatient, routeId) {
  return String(chartPatient?.legacy_sync_id || routeId || '').trim()
}

function normalizeChartResponse(chart) {
  return {
    success: true,
    ok: true,
    migrated: Boolean(chart.migrated),
    patient: chart.patient,
    clinicalBase: chart.clinicalBase,
    evolutions: chart.evolutions || [],
    assets: chart.assets || [],
  }
}

router.get('/patients/:idOrSyncId/chart', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const query = req.query && typeof req.query === 'object' ? req.query : {}
    const result = await getOrMigrateEmrV2Chart({
      clinicaId: auth.canonical,
      idOrSyncId,
      aliasIds: auth.aliases,
      actor: actorFromAuth(auth),
      documentNumber: String(query.documentNumber || '').trim(),
      localId: String(query.localId || '').trim(),
    })
    if (!result.ok) {
      sendJson(res, result.status || 404, {
        success: false,
        ok: false,
        error: result.error || 'No encontrado',
        code: result.code,
      })
      return
    }
    sendJson(res, 200, { clinicId: auth.canonical, ...normalizeChartResponse(result) })
  } catch (error) {
    console.error('[EMR v2] GET chart:', error)
    sendJson(res, 500, {
      success: false,
      ok: false,
      error: 'No se pudo leer la historia EMR v2.',
    })
  }
})

router.patch('/patients/:idOrSyncId/base/:section', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const sectionParse = sectionSchema.safeParse(String(req.params.section || '').trim())
    if (!sectionParse.success) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: `Sección inválida. Use una de: ${ALLOWED_CLINICAL_SECTIONS.join(', ')}`,
        code: 'INVALID_SECTION',
      })
      return
    }
    const bodyParse = patchBodySchema.safeParse(req.body || {})
    if (!bodyParse.success) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'Body inválido. Se requiere { payload, expectedVersion }.',
        code: 'BAD_REQUEST',
        details: bodyParse.error.flatten(),
      })
      return
    }
    const base64Check = rejectHeavyBase64InJson(bodyParse.data.payload)
    if (!base64Check.ok) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: base64Check.error,
        code: base64Check.code,
        path: base64Check.path,
      })
      return
    }

    const actor = actorFromAuth(auth)
    const result = await upsertClinicalBaseSection(
      auth.canonical,
      idOrSyncId,
      sectionParse.data,
      bodyParse.data.payload,
      bodyParse.data.expectedVersion,
      actor,
    )
    if (!result.ok) {
      sendJson(res, result.status || 400, {
        success: false,
        ok: false,
        error: result.error || 'No se pudo actualizar la sección',
        code: result.code,
        version: result.version,
      })
      return
    }

    emitEmrV2PatientUpdated({
      clinicaId: auth.canonical,
      patientSyncId: idOrSyncId,
      section: sectionParse.data,
      newVersion: result.version,
      actorEmail: actor.email,
      updatedAt: new Date().toISOString(),
    })

    sendJson(res, 200, {
      success: true,
      ok: true,
      version: result.version,
      contentHash: result.contentHash,
      section: result.section,
      patientId: result.patientId,
    })
  } catch (error) {
    if (error?.name === 'ZodError') {
      sendJson(res, 400, { success: false, ok: false, error: 'Validación Zod fallida', details: error.flatten?.() })
      return
    }
    console.error('[EMR v2] PATCH base section:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo actualizar la sección clínica.' })
  }
})

router.post('/patients/:idOrSyncId/evolutions', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const bodyParse = evolutionBodySchema.safeParse(req.body || {})
    if (!bodyParse.success) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'Body de evolución inválido.',
        details: bodyParse.error.flatten(),
      })
      return
    }
    const base64Check = rejectHeavyBase64InJson(bodyParse.data.contenido ?? bodyParse.data)
    if (!base64Check.ok) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: base64Check.error,
        code: base64Check.code,
        path: base64Check.path,
      })
      return
    }

    const actor = actorFromAuth(auth)
    const lockNow = bodyParse.data.lockNow === true
    const result = await createOrLockEvolution(
      auth.canonical,
      idOrSyncId,
      bodyParse.data,
      lockNow,
      actor,
    )
    if (!result.ok) {
      sendJson(res, result.status || 400, {
        success: false,
        ok: false,
        error: result.error,
        code: result.code,
      })
      return
    }

    emitEmrV2PatientUpdated({
      clinicaId: auth.canonical,
      patientSyncId: idOrSyncId,
      section: 'evolutions',
      newVersion: null,
      actorEmail: actor.email,
    })

    sendJson(res, 201, { success: true, ok: true, evolution: result.evolution })
  } catch (error) {
    console.error('[EMR v2] POST evolutions:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo crear la evolución.' })
  }
})

router.post('/patients/:idOrSyncId/evolutions/:evolutionId/lock', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const evolutionId = String(req.params.evolutionId || '').trim()
    const actor = actorFromAuth(auth)
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const base64Check = rejectHeavyBase64InJson(body)
    if (!base64Check.ok) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: base64Check.error,
        code: base64Check.code,
      })
      return
    }

    const result = await createOrLockEvolution(
      auth.canonical,
      idOrSyncId,
      { ...body, id: evolutionId },
      true,
      actor,
    )
    if (!result.ok) {
      const status =
        result.code === 'LEGAL_IMMUTABILITY_VIOLATION' ? 403 : result.status || 400
      sendJson(res, status, {
        success: false,
        ok: false,
        error: result.error,
        code: result.code || 'LEGAL_IMMUTABILITY_VIOLATION',
      })
      return
    }

    emitEmrV2PatientUpdated({
      clinicaId: auth.canonical,
      patientSyncId: idOrSyncId,
      section: 'evolutions.lock',
      actorEmail: actor.email,
    })

    sendJson(res, 200, { success: true, ok: true, evolution: result.evolution })
  } catch (error) {
    console.error('[EMR v2] POST lock evolution:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo sellar la evolución.' })
  }
})

/** Intento explícito de mutar evolución (debe fallar si locked) — útil para clientes/tests. */
router.patch('/patients/:idOrSyncId/evolutions/:evolutionId', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const evolutionId = String(req.params.evolutionId || '').trim()
    const result = await mutateLockedEvolutionForbidden(auth.canonical, evolutionId, 'update')
    if (!result.ok) {
      sendJson(res, result.status || 403, {
        success: false,
        ok: false,
        error: result.error || 'LEGAL_IMMUTABILITY_VIOLATION',
        code: result.code || 'LEGAL_IMMUTABILITY_VIOLATION',
      })
      return
    }
    sendJson(res, 200, { success: true, ok: true })
  } catch (error) {
    console.error('[EMR v2] PATCH evolution:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo mutar la evolución.' })
  }
})

router.post('/patients/:idOrSyncId/assets', upload.single('file'), async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const actor = actorFromAuth(auth)
    const chart = await getOrMigrateEmrV2Chart({
      clinicaId: auth.canonical,
      idOrSyncId,
      aliasIds: auth.aliases,
      actor,
    })
    if (!chart.ok) {
      sendJson(res, chart.status || 404, {
        success: false,
        ok: false,
        error: chart.error || 'Paciente no encontrado',
        code: chart.code,
      })
      return
    }

    const file = req.file
    if (!file?.buffer?.length) {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'Adjunte un archivo multipart en el campo "file".',
        code: 'FILE_REQUIRED',
      })
      return
    }

    const assetType = String(req.body?.assetType || req.body?.asset_type || 'anexo').trim()
    const persisted = await persistClinicalAsset({
      clinicaId: auth.canonical,
      patientId: chart.patient.id,
      assetType,
      fileName: file.originalname || 'upload.bin',
      mimeType: file.mimetype || 'application/octet-stream',
      buffer: file.buffer,
      actor,
    })
    if (!persisted.ok) {
      sendJson(res, persisted.status || 400, {
        success: false,
        ok: false,
        error: persisted.error,
        code: persisted.code,
      })
      return
    }

    emitEmrV2PatientUpdated({
      clinicaId: auth.canonical,
      patientSyncId: patientSyncIdOf(chart.patient, idOrSyncId),
      section: 'assets',
      actorEmail: actor.email,
    })

    sendJson(res, 201, { success: true, ok: true, asset: persisted.asset })
  } catch (error) {
    if (error?.name === 'ZodError') {
      sendJson(res, 400, {
        success: false,
        ok: false,
        error: 'assetType inválido',
        details: error.flatten?.(),
      })
      return
    }
    console.error('[EMR v2] POST assets:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo guardar el asset clínico.' })
  }
})

router.get('/assets/:assetId/content', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const assetId = String(req.params.assetId || '').trim()
    const result = await readClinicalAssetContent(auth.canonical, assetId)
    if (!result.ok) {
      sendJson(res, result.status || 404, {
        success: false,
        ok: false,
        error: result.error,
        code: result.code,
      })
      return
    }
    res.setHeader('Content-Type', result.asset.mime_type || 'application/octet-stream')
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${encodeURIComponent(result.asset.file_name || 'asset')}"`,
    )
    res.setHeader('X-Content-SHA256', result.asset.sha256_hash)
    res.status(200).send(result.buffer)
  } catch (error) {
    console.error('[EMR v2] GET asset content:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo leer el asset.' })
  }
})

router.get('/patients/:idOrSyncId/audit-trail', async (req, res) => {
  try {
    const auth = await requireClinicSession(req, res)
    if (!auth) return
    const idOrSyncId = String(req.params.idOrSyncId || '').trim()
    const chart = await getOrMigrateEmrV2Chart({
      clinicaId: auth.canonical,
      idOrSyncId,
      aliasIds: auth.aliases,
      actor: actorFromAuth(auth),
    })
    if (!chart.ok) {
      sendJson(res, chart.status || 404, {
        success: false,
        ok: false,
        error: chart.error || 'Paciente no encontrado',
        code: chart.code,
      })
      return
    }
    const limit = Number(req.query?.limit || 200)
    const rows = await getEmrV2AuditTrail(auth.canonical, chart.patient.id, { limit })
    sendJson(res, 200, {
      success: true,
      ok: true,
      patientId: chart.patient.id,
      auditTrail: rows,
    })
  } catch (error) {
    console.error('[EMR v2] GET audit-trail:', error)
    sendJson(res, 500, { success: false, ok: false, error: 'No se pudo leer la bitácora forense.' })
  }
})

export {
  requireClinicSession,
  rejectHeavyBase64InJson,
  sectionSchema,
  patchBodySchema,
}
export default router
