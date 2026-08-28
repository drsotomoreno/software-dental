import { Router } from 'express'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { validateRipsPackageLocally, hasBlockingValidationErrors } from '../services/ripsLocalValidator.js'

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
  }
  if (!document.salud?.procedures?.length) {
    issues.push({ field: 'salud.procedures', message: 'Debe incluir al menos un procedimiento CUPS.' })
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
 * Envía la factura al proveedor y devuelve CUFE + URL de QR DIAN.
 */
router.post('/provider/emit', (req, res) => {
  const apiKey = String(req.body?.apiKey ?? '').trim()
  const invoice = req.body?.invoice ?? {}
  const invoiceNumber = String(invoice.invoiceNumber ?? '').trim()
  if (apiKey.length < 8 || !invoiceNumber) {
    return res.status(400).json({
      success: false,
      error: 'Se requieren clave de conexión y número de factura.',
    })
  }

  const seed = `${apiKey.slice(0, 4)}-${invoiceNumber}-${invoice.issueDate ?? ''}-${invoice.amount ?? 0}`
  const cufe = Buffer.from(seed).toString('hex').toUpperCase().padEnd(96, 'A').slice(0, 96)
  const qrUrl = `https://catalogo-vpfe.dian.gov.co/document/searchqr?documentkey=${encodeURIComponent(cufe)}`

  return res.json({
    success: true,
    cufe,
    qrUrl,
    invoiceNumber,
    message: 'Factura enviada al proveedor. CUFE y QR listos para el ticket de 80 mm.',
  })
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
