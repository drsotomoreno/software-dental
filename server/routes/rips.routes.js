import { Router } from 'express'
import { submitRipsToMinsalud } from '../services/minsaludRipsClient.js'
import { saveCuvRecord, getCuvByFactura, listCuvRecords, getCuvById } from '../services/cuvRepository.js'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { validateRipsPackageLocally, hasBlockingValidationErrors } from '../services/ripsLocalValidator.js'
import {
  saveTemporaryRipsRecord,
  listTemporaryRipsRecords,
  getTemporaryRipsRecord,
} from '../services/ripsTemporalStore.js'
import { processDictatedEvolution } from '../controllers/clinicalVoiceBilling.controller.js'
import { getMonthlyRipsStatus, runMonthlyRipsJob } from '../controllers/monthlyRips.controller.js'

const router = Router()

/**
 * POST /api/rips/evolucion-dictada
 * Motor de dictado terminó: valida perfil fiscal y enruta FEV+RIPS o RIPS pendiente.
 */
router.post('/evolucion-dictada', processDictatedEvolution)

/**
 * GET /api/rips/mensual/estado
 * Estado del cron de envío mensual (día 1, 02:00 America/Bogota).
 */
router.get('/mensual/estado', getMonthlyRipsStatus)

/**
 * POST /api/rips/mensual/enviar
 * Disparo manual (superadmin). Body: { dryRun?: true }
 */
router.post('/mensual/enviar', runMonthlyRipsJob)

/**
 * POST /api/rips/validate
 * Valida localmente y radica ante MinSalud; persiste CUV si es aprobado.
 */
router.post('/validate', async (req, res, next) => {
  try {
    const { rips, metadatos, invoice } = req.body ?? {}

    if (!rips) {
      return res.status(400).json({ success: false, error: 'El cuerpo debe incluir el objeto rips.' })
    }

    const result = await submitRipsToMinsalud({ rips, metadatos })

    if (!result.success) {
      return res.status(422).json({
        success: false,
        approved: false,
        source: result.source,
        localIssues: result.localIssues ?? [],
        ministryErrors: result.ministryErrors ?? [],
      })
    }

    const cuvRecord = await saveCuvRecord({
      cuv: result.cuv,
      numFactura: rips.numFactura,
      numDocumentoIdObligado: rips.numDocumentoIdObligado,
      status: 'approved',
      procesoId: result.procesoId,
      fechaRadicacion: result.fechaRadicacion,
      estado: result.estado,
      source: result.source,
      metadatos: { ...metadatos, ...result.metadatos },
      clinicalRecordIds: metadatos?.clinicalRecordIds ?? [],
      patientUuid: metadatos?.patientUuid ?? null,
    })

    let dianXml = null
    if (invoice) {
      dianXml = buildDianHealthInvoiceXml({
        cuv: result.cuv,
        numFactura: rips.numFactura,
        ...invoice,
      })
      cuvRecord.dianXmlGenerated = true
    }

    res.json({
      success: true,
      approved: true,
      cuv: result.cuv,
      procesoId: result.procesoId,
      fechaRadicacion: result.fechaRadicacion,
      estado: result.estado,
      source: result.source,
      localWarnings: result.localIssues ?? [],
      cuvRecordId: cuvRecord.id,
      dianXml,
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/rips/validate-local
 * Solo validación local (sin llamada al ministerio).
 */
router.post('/validate-local', (req, res) => {
  const { rips, metadatos, perfilFiscal, esRipsTemporal } = req.body ?? {}
  if (!rips) {
    return res.status(400).json({ success: false, error: 'El cuerpo debe incluir rips.' })
  }

  const issues = validateRipsPackageLocally(rips, {
    crossValidateAgeSex: true,
    perfilFiscal: perfilFiscal ?? metadatos?.perfilFiscal,
    esRipsTemporal: esRipsTemporal ?? metadatos?.esRipsTemporal,
  })
  res.json({
    success: !hasBlockingValidationErrors(issues),
    issues,
  })
})

/**
 * GET /api/rips/cuv?numFactura=FV-001
 */
router.get('/cuv', async (req, res, next) => {
  try {
    const { numFactura, id } = req.query
    if (id) {
      const record = await getCuvById(String(id))
      if (!record) return res.status(404).json({ success: false, error: 'CUV no encontrado.' })
      return res.json({ success: true, record })
    }
    if (!numFactura) {
      return res.status(400).json({ success: false, error: 'Indique numFactura o id.' })
    }
    const record = await getCuvByFactura(String(numFactura))
    if (!record) return res.status(404).json({ success: false, error: 'CUV no encontrado para esa factura.' })
    res.json({ success: true, record })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/rips/cuv/history
 */
router.get('/cuv/history', async (req, res, next) => {
  try {
    const records = await listCuvRecords({ limit: Number(req.query.limit ?? 50) })
    res.json({ success: true, records })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/rips/dian-xml
 * Genera XML FEV-Salud con CUV ya obtenido.
 */
router.post('/dian-xml', async (req, res, next) => {
  try {
    const { cuv, numFactura, invoice } = req.body ?? {}
    if (!cuv || !numFactura) {
      return res.status(400).json({
        success: false,
        error: 'cuv y numFactura son obligatorios.',
      })
    }

    const xml = buildDianHealthInvoiceXml({
      cuv,
      numFactura,
      nitEmisor: invoice?.nitEmisor ?? '',
      razonSocialEmisor: invoice?.razonSocialEmisor ?? 'Prestador de servicios de salud',
      nitAdquiriente: invoice?.nitAdquiriente ?? '222222222222',
      razonSocialAdquiriente: invoice?.razonSocialAdquiriente ?? 'Adquiriente',
      issueDate: invoice?.issueDate ?? new Date().toISOString().slice(0, 10),
      payableAmount: invoice?.payableAmount ?? 0,
      lines: invoice?.lines ?? [],
    })

    res.json({ success: true, xml })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/rips/temporales
 * Lista RIPS temporales. numFactura puede ser null.
 */
router.get('/temporales', async (req, res, next) => {
  try {
    const records = await listTemporaryRipsRecords({
      clinicId: req.query.clinicId ? String(req.query.clinicId) : undefined,
      limit: Number(req.query.limit ?? 100),
    })
    res.json({ success: true, records })
  } catch (error) {
    next(error)
  }
})

/**
 * GET /api/rips/temporales/:id
 */
router.get('/temporales/:id', async (req, res, next) => {
  try {
    const record = await getTemporaryRipsRecord(String(req.params.id))
    if (!record) return res.status(404).json({ success: false, error: 'RIPS temporal no encontrado.' })
    res.json({ success: true, record })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/rips/temporales
 * Crea o actualiza un RIPS temporal. numFactura acepta null.
 */
router.post('/temporales', async (req, res, next) => {
  try {
    const body = req.body ?? {}
    const rips = body.ripsJson ?? body.rips
    if (!rips) {
      return res.status(400).json({ success: false, error: 'El cuerpo debe incluir rips o ripsJson.' })
    }

    const issues = validateRipsPackageLocally(rips, {
      perfilFiscal: body.perfilFiscal,
      esRipsTemporal: true,
      allowNullNumFactura: true,
    })
    if (hasBlockingValidationErrors(issues)) {
      return res.status(422).json({
        success: false,
        error: 'El RIPS temporal no cumple validaciones locales.',
        issues,
      })
    }

    const record = await saveTemporaryRipsRecord({
      ...body,
      ripsJson: {
        ...rips,
        numFactura: body.numFactura === undefined ? rips.numFactura : body.numFactura,
      },
      numFactura: body.numFactura === undefined ? rips.numFactura : body.numFactura,
    })

    res.json({ success: true, record })
  } catch (error) {
    next(error)
  }
})

export default router
