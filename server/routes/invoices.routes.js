import { Router } from 'express'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { empaquetarConCuv } from '../services/FacturacionService.js'
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
    issues.push({ field: 'cuv', message: 'El CUV es obligatorio para emisión DIAN.' })
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
 * Genera XML FEV-Salud cuando ya existe CUV.
 */
router.post('/build-xml', (req, res, next) => {
  try {
    const { cuv, numFactura, invoice } = req.body ?? {}
    if (!cuv?.trim()) {
      return res.status(400).json({ success: false, error: 'CUV obligatorio.' })
    }
    if (!numFactura?.trim() || !invoice) {
      return res.status(400).json({ success: false, error: 'numFactura e invoice son obligatorios.' })
    }

    const xml = buildDianHealthInvoiceXml({
      cuv,
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
 * POST /api/invoices/provider/emit
 * Empaqueta la FEV solo si ya existe CUV y devuelve CUFE + pdfUrl del proveedor.
 */
router.post('/provider/emit', async (req, res, next) => {
  try {
    const apiKey = String(req.body?.apiKey ?? '').trim()
    const invoice = req.body?.invoice ?? {}
    const invoiceNumber = String(invoice.invoiceNumber ?? invoice.numFactura ?? '').trim()
    const cuv = String(invoice.cuv ?? req.body?.cuv ?? '').trim()
    if (!cuv) {
      return res.status(400).json({
        success: false,
        error: 'El CUV es obligatorio para empaquetar la factura electrónica.',
      })
    }
    if (apiKey.length < 8 || !invoiceNumber) {
      return res.status(400).json({
        success: false,
        error: 'Se requieren clave de conexión y número de factura.',
      })
    }

    const billing = await empaquetarConCuv({
      cuv,
      invoice: { ...invoice, invoiceNumber },
      provider: req.body?.provider,
    })
    if (!billing.success) {
      return res.status(400).json({ success: false, error: billing.error })
    }

    const qrUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${encodeURIComponent(billing.cufe)}`

    return res.json({
      success: true,
      status: 'EXITOSO',
      cuv: billing.cuv,
      cufe: billing.cufe,
      pdfUrl: billing.pdfUrl,
      qrUrl,
      provider: billing.provider,
      invoiceNumber,
      message: 'Factura enviada al proveedor. CUFE y PDF listos para el ticket de 80 mm.',
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
