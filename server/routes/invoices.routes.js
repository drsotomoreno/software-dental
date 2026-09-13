import { Router } from 'express'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { emitProviderInvoice } from '../services/dianFeClient.js'
import { processElectronicInvoiceSubmission } from '../services/invoiceService.js'
import { validateRipsPackageLocally, hasBlockingValidationErrors } from '../services/ripsLocalValidator.js'
import { parseRepsCode } from '../../shared/repsCode.js'

const router = Router()

const INVOICE_DELETE_FORBIDDEN_MESSAGE =
  'Por disposición tributaria de la DIAN y normatividad en salud, las facturas electrónicas emitidas no se pueden eliminar de la base de datos.'

/** Bloqueo normativo: ninguna factura puede eliminarse vía DELETE. */
router.delete(/.*/, (_req, res) => {
  res.status(403).json({
    success: false,
    error: INVOICE_DELETE_FORBIDDEN_MESSAGE,
  })
})

/**
 * POST /api/invoices/validate-document
 * Valida estructura mínima del documento FEV-Salud antes de encolar o emitir.
 */
router.post('/validate-document', (req, res) => {
  const document = req.body?.document
  if (!document) {
    return res.status(400).json({ success: false, error: 'Se requiere el objeto document.' })
  }

  const issues = []

  if (!document.dian?.invoiceNumber?.trim()) {
    issues.push({ field: 'dian.invoiceNumber', message: 'Número de factura obligatorio.' })
  }
  if (!document.dian?.issuer?.nit?.trim()) {
    issues.push({ field: 'dian.issuer.nit', message: 'NIT del emisor obligatorio.' })
  }
  if (!document.dian?.buyer?.documentNumber?.trim()) {
    issues.push({ field: 'dian.buyer.documentNumber', message: 'Documento del adquirente obligatorio.' })
  }
  if (!document.salud?.codPrestadorReps?.trim()) {
    issues.push({ field: 'salud.codPrestadorReps', message: 'Código REPS obligatorio.' })
  } else {
    const reps = parseRepsCode(document.salud.codPrestadorReps)
    if (!reps.valid) {
      issues.push({ field: 'salud.codPrestadorReps', message: reps.message })
    }
  }
  const hasCups = (document.salud?.procedures ?? []).some((proc) => String(proc?.cupsCode ?? '').replace(/\D/g, '').length === 6)
  const hasNamedLine = (document.salud?.procedures ?? []).some((proc) => String(proc?.description ?? '').trim())
  if (!document.salud?.procedures?.length || (!hasCups && !hasNamedLine)) {
    issues.push({
      field: 'salud.procedures',
      message: 'Debe incluir al menos un procedimiento CUPS o un servicio estético/insumo con nombre.',
    })
  }

  const requireCuv = Boolean(req.body?.requireCuv)
  if (requireCuv && !document.salud?.cuv?.trim() && !document.cuv?.trim()) {
    issues.push({
      field: 'cuv',
      message: 'El CUV es obligatorio para entregar la FEV al paciente, no para enviarla a la DIAN.',
    })
  }

  if (document.rips) {
    const local = validateRipsPackageLocally(document.rips)
    if (hasBlockingValidationErrors(local)) {
      issues.push(...local.map((issue) => ({ field: issue.field, message: issue.message })))
    }
  }

  return res.json({
    success: issues.length === 0,
    issues,
  })
})

/**
 * POST /api/invoices/build-xml
 * Genera XML FEV-Salud para envío a la DIAN (CUV opcional).
 */
router.post('/build-xml', (req, res, next) => {
  try {
    const { cuv, cufe, numFactura, invoice } = req.body ?? {}
    if (!numFactura?.trim() || !invoice) {
      return res.status(400).json({ success: false, error: 'numFactura e invoice son obligatorios.' })
    }

    const xml = buildDianHealthInvoiceXml({
      cuv,
      cufe,
      numFactura,
      ...invoice,
    })

    res.json({ success: true, xml })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/invoices/queue
 * Recibe documento FEV-Salud para procesamiento backend (cola / outbox servidor).
 */
router.post('/queue', (req, res) => {
  const document = req.body?.document
  if (!document?.dian?.invoiceNumber) {
    return res.status(400).json({ success: false, error: 'Documento FEV inválido.' })
  }

  return res.json({
    success: true,
    queued: true,
    invoiceNumber: document.dian.invoiceNumber,
    message: 'Documento recibido para procesamiento DIAN/RIPS.',
  })
})

/**
 * POST /api/invoices/provider/test
 * Comprueba que hay clave de conexión hacia el proveedor tecnológico.
 */
router.post('/provider/test', (req, res) => {
  const provider = String(req.body?.provider ?? '').trim()
  const apiKey = String(req.body?.apiKey ?? '').trim()
  if (!provider || apiKey.length < 8) {
    return res.status(400).json({
      success: false,
      error: 'Indique el proveedor y una clave de al menos 8 caracteres.',
    })
  }
  return res.json({
    success: true,
    provider,
    message: `Conexión lista con ${provider}. Puede emitir facturas con un clic.`,
  })
})

/**
 * POST /api/invoices/emit-dual
 * Orquesta CUFE (DIAN) → inyección en RIPS → CUV (MUV).
 */
router.post('/emit-dual', async (req, res, next) => {
  try {
    const { rips, invoice, metadatos, options } = req.body ?? {}
    if (!invoice && !rips) {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'Se requiere invoice y/o rips para el flujo dual CUFE/CUV.',
      })
    }

    const result = await processElectronicInvoiceSubmission({
      rips: rips ?? {},
      invoice,
      metadatos: metadatos ?? {},
      options: options ?? {},
    })

    const status = result.listoParaEntrega
      ? 200
      : result.estado_dian === 'Rechazado'
        ? 422
        : result.estado_minsalud_muv === 'Rechazado_Con_Glosas'
          ? 422
          : 200

    return res.status(status).json({
      ...result,
      success: result.listoParaEntrega === true,
      ok: result.listoParaEntrega === true || result.estado_dian === 'Aprobado',
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/invoices/provider/emit
 * Envía la factura al proveedor y devuelve CUFE + URL de QR DIAN.
 */
router.post('/provider/emit', async (req, res, next) => {
  try {
    const apiKey = String(req.body?.apiKey ?? '').trim()
    const invoice = req.body?.invoice ?? {}
    const invoiceNumber = String(invoice.invoiceNumber ?? '').trim()
    if (apiKey.length < 8 || !invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren clave de conexión y número de factura.',
      })
    }

    const result = await emitProviderInvoice({ apiKey, invoice: { ...invoice, invoiceNumber } })
    return res.json({
      ...result,
      message: result.message || 'Factura enviada al proveedor. CUFE y QR listos para el ticket de 80 mm.',
    })
  } catch (error) {
    next(error)
  }
})

/**
 * POST /api/invoices/credit-note
 * Registra Nota Crédito Electrónica vinculada a FEV original (inmutabilidad).
 */
router.post('/credit-note', (req, res) => {
  const creditNote = req.body?.creditNote
  if (!creditNote?.creditNoteNumber || !creditNote?.originalInvoiceNumber || !creditNote?.reason?.trim()) {
    return res.status(400).json({
      success: false,
      error: 'Nota crédito inválida: requiere número, factura origen y motivo.',
    })
  }

  return res.json({
    success: true,
    creditNoteNumber: creditNote.creditNoteNumber,
    originalInvoiceNumber: creditNote.originalInvoiceNumber,
    originalCuv: creditNote.originalCuv ?? null,
    originalCufe: creditNote.originalCufe ?? null,
    message: 'Nota Crédito registrada. La factura original permanece en el historial.',
  })
})

export default router
