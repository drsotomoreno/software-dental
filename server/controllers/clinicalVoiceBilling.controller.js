import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import {
  collectExtractedCodes,
  enrutarPorPerfilFiscal,
  hasExtractedCie10AndCups,
} from '../services/billingAndRipsService.js'
import { normalizePerfilFiscal } from '../../shared/fiscalProfile.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

/**
 * POST /api/rips/evolucion-dictada
 * Tras extraer CIE-10 y CUPS del dictado, valida el perfil fiscal del usuario
 * y enruta a generarFEV_y_RIPS() o guardarRIPS_Pendiente(numFactura: null).
 */
export async function processDictatedEvolution(req, res, next) {
  try {
    const session = await resolveSubscriptionSession(bearerToken(req), sessionHintFromRequest(req))
    if (!session?.user) {
      return res.status(401).json({
        success: false,
        ok: false,
        error: 'Sesión inválida o expirada.',
      })
    }

    const body = req.body && typeof req.body === 'object' ? req.body : {}
    const rips = body.rips ?? body.ripsJson
    if (!rips || typeof rips !== 'object') {
      return res.status(400).json({
        success: false,
        ok: false,
        error: 'El cuerpo debe incluir el objeto rips generado por el dictado.',
      })
    }

    const codes = collectExtractedCodes(rips, {
      cie10: body.cie10,
      cups: body.cups,
      clinicalItems: body.clinicalItems,
    })
    if (!hasExtractedCie10AndCups(codes)) {
      return res.status(422).json({
        success: false,
        ok: false,
        error: 'El dictado aún no extrajo códigos CIE-10 y CUPS.',
        codes,
      })
    }

    const perfilFiscal = normalizePerfilFiscal(session.user.perfilFiscal)
    const result = await enrutarPorPerfilFiscal({
      perfilFiscal,
      rips,
      invoice: body.invoice,
      metadatos: {
        ...(body.metadatos && typeof body.metadatos === 'object' ? body.metadatos : {}),
        perfilFiscal,
        clinicId: session.user.clinicId || session.user.id,
        professionalId: session.user.id,
      },
      user: session.user,
    })

    const status = result.ok ? 200 : result.localIssues ? 422 : 502
    return res.status(status).json({
      ...result,
      success: result.ok === true,
      ok: result.ok === true,
      codes,
      perfilFiscal,
    })
  } catch (error) {
    next(error)
  }
}
