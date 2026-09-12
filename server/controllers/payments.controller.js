/**
 * Controlador de pagos / legalización FEV.
 * Orquesta el flujo estricto: DIAN (CUFE) → ensamblaje RIPS → MUV (CUV).
 */
import { ejecutarFlujoDobleValidacion } from '../services/dualValidationBilling.js'
import {
  getInvoiceTransaction,
  listInvoiceTransactions,
} from '../services/invoiceTransactionStore.js'
import { isTransactionLegalizada } from '../../shared/dualValidation.js'

function httpStatusFor(result) {
  if (result.legalizada || result.ok) return 200
  if (result.failedStep === 'rips_local') return 422
  if (result.failedStep === 'dian') return 422
  if (result.failedStep === 'muv') return 422
  return 400
}

/**
 * POST /api/payments/legalize
 * Body: { rips, invoice, metadatos?, transactionId? }
 */
export async function legalizeElectronicPayment(req, res, next) {
  try {
    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const rips = body.rips ?? body.ripsJson
    const invoice = body.invoice
    if (!rips || typeof rips !== 'object') {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El cuerpo debe incluir el objeto rips (JSON de historia clínica / RIPS).',
      })
    }
    if (!invoice || typeof invoice !== 'object') {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El cuerpo debe incluir invoice (payload financiero para el XML DIAN).',
      })
    }

    const result = await ejecutarFlujoDobleValidacion({
      rips,
      invoice,
      metadatos: body.metadatos && typeof body.metadatos === 'object' ? body.metadatos : {},
      transactionId: body.transactionId,
    })

    return res.status(httpStatusFor(result)).json({
      ...result,
      success: result.ok === true && result.legalizada === true,
      ok: result.ok === true,
      legalizada: result.legalizada === true,
      cufe: result.codigo_cufe ?? null,
      cuv: result.codigo_cuv ?? null,
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/payments/transactions/:id
 */
export async function getLegalizationTransaction(req, res, next) {
  try {
    const record = await getInvoiceTransaction({ id: String(req.params.id) })
    if (!record) {
      return res.status(404).json({ success: false, error: 'Transacción no encontrada.' })
    }
    return res.json({
      success: true,
      record,
      legalizada: isTransactionLegalizada(record),
    })
  } catch (error) {
    next(error)
  }
}

/**
 * GET /api/payments/transactions?numFactura=
 */
export async function listLegalizationTransactions(req, res, next) {
  try {
    const numFactura = req.query.numFactura ? String(req.query.numFactura) : ''
    if (numFactura) {
      const record = await getInvoiceTransaction({ numFactura })
      if (!record) {
        return res.status(404).json({ success: false, error: 'Transacción no encontrada para esa factura.' })
      }
      return res.json({
        success: true,
        record,
        legalizada: isTransactionLegalizada(record),
      })
    }
    const records = await listInvoiceTransactions({ limit: Number(req.query.limit ?? 50) })
    return res.json({ success: true, records })
  } catch (error) {
    next(error)
  }
}
