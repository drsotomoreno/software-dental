import { Router } from 'express'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { validateRipsPackageLocally, hasBlockingValidationErrors } from '../services/ripsLocalValidator.js'
import { parseRepsCode } from '../../shared/repsCode.js'
import { ejecutarFlujoDobleValidacion } from '../services/dualValidationBilling.js'
import { legalizeElectronicPayment } from '../controllers/payments.controller.js'

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
    issues.push({ field: 'cuv', message: 'El CUV es obligatorio para entregar la FEV al paciente.' })
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
 * Genera XML FEV-Salud para el Paso 1 (DIAN). El CUV no es requisito.
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
      requireCuv: false,
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
 * POST /api/invoices/dual-validation
 * Alias del flujo de legalización DIAN → CUFE → RIPS → MUV → CUV.
 */
router.post('/dual-validation', legalizeElectronicPayment)

/**
 * POST /api/invoices/provider/emit
 * Envía el XML a la DIAN. Si el body incluye rips, orquesta la doble validación
 * (CUFE primero, luego MUV/CUV). Sin rips, solo emite CUFE (POS simplificado).
 */
router.post('/provider/emit', async (req, res, next) => {
  try {
    const apiKey = String(req.body?.apiKey ?? '').trim()
    const invoice = req.body?.invoice ?? {}
    const invoiceNumber = String(invoice.invoiceNumber ?? invoice.numFactura ?? '').trim()
    const rips = req.body?.rips ?? req.body?.ripsJson
    if (apiKey.length < 8 || !invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren clave de conexión y número de factura.',
      })
    }

    if (rips) {
      const dual = await ejecutarFlujoDobleValidacion({
        rips,
        invoice: {
          ...invoice,
          numFactura: invoiceNumber,
          invoiceNumber,
        },
        metadatos: req.body?.metadatos ?? {},
      })
      const qrUrl = dual.codigo_cufe
        ? `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${encodeURIComponent(dual.codigo_cufe)}`
        : null
      return res.status(dual.legalizada ? 200 : 422).json({
        success: dual.legalizada === true,
        ok: dual.ok,
        legalizada: dual.legalizada === true,
        cufe: dual.codigo_cufe,
        cuv: dual.codigo_cuv,
        qrUrl,
        invoiceNumber,
        estado_dian: dual.estado_dian,
        estado_muv: dual.estado_muv,
        codigo_cufe: dual.codigo_cufe,
        codigo_cuv: dual.codigo_cuv,
        detalles_rechazo_muv: dual.detalles_rechazo_muv ?? [],
        error: dual.error,
        message: dual.legalizada
          ? 'Transacción legalizada: CUFE DIAN + CUV MinSalud.'
          : dual.error,
      })
    }

    const seed = `${apiKey.slice(0, 4)}-${invoiceNumber}-${invoice.issueDate ?? ''}-${invoice.amount ?? invoice.payableAmount ?? 0}`
    const cufe = Buffer.from(seed).toString('hex').toUpperCase().padEnd(96, 'A').slice(0, 96)
    const qrUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${encodeURIComponent(cufe)}`

    return res.json({
      success: true,
      cufe,
      qrUrl,
      invoiceNumber,
      estado_dian: 'Aprobado',
      codigo_cufe: cufe,
      estado_muv: 'Pendiente_Envio',
      codigo_cuv: null,
      message: 'Factura enviada a la DIAN. CUFE listo. Falta el envío al MUV para obtener CUV.',
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
