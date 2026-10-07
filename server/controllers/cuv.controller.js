import { consultarEstadoCuv, listarExpedientes, reenviarExpediente } from '../services/cuv/service.js'

export async function listCuvExpedientes(req, res, next) {
  try {
    const expedientes = await listarExpedientes({
      estado: req.query.estado ? String(req.query.estado) : undefined,
      limit: Number(req.query.limit ?? 100),
    })
    const requierenAtencion = expedientes.filter((item) => item.estado !== 'aprobado').length
    res.json({ success: true, expedientes, requierenAtencion })
  } catch (error) {
    next(error)
  }
}

export async function getCuvExpediente(req, res, next) {
  try {
    const result = await consultarEstadoCuv({ id: String(req.params.id) })
    if (!result.success) return res.status(result.status).json({ success: false, error: result.error })
    res.json({ success: true, expediente: result.expediente })
  } catch (error) {
    next(error)
  }
}

export async function consultCuvEstado(req, res, next) {
  try {
    const { id, cuv, numFactura, numDocumentoIdObligado } = req.body ?? {}
    if (!id && !cuv && !numFactura) {
      return res.status(400).json({
        success: false,
        error: 'Indique el CUV, el número de factura o el expediente.',
      })
    }
    const result = await consultarEstadoCuv({
      id: id ? String(id) : undefined,
      cuv: cuv ? String(cuv) : undefined,
      numFactura: numFactura ? String(numFactura) : undefined,
      numDocumentoIdObligado: numDocumentoIdObligado ? String(numDocumentoIdObligado) : undefined,
    })
    if (!result.success) return res.status(result.status).json({ success: false, error: result.error })
    res.json({ success: true, expediente: result.expediente })
  } catch (error) {
    next(error)
  }
}

export async function resendCuvPackage(req, res, next) {
  try {
    const result = await reenviarExpediente(String(req.params.id))
    if (!result.expediente) {
      return res.status(result.status).json({ success: false, error: result.error })
    }
    res.status(result.status).json({
      success: result.success,
      error: result.success ? undefined : 'El reenvío quedó rechazado. Revise las reglas del MUV.',
      expediente: result.expediente,
    })
  } catch (error) {
    next(error)
  }
}
