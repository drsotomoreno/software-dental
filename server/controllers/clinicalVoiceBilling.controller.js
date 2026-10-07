import {
  resolveSubscriptionSession,
  sessionHintFromRequest,
} from '../services/subscriptionAuthStore.js'
import {
  collectExtractedCodes,
  enrutarPorPerfilFiscal,
  hasExtractedCie10AndCups,
} from '../services/billingAndRipsService.js'
import { isObligadoFev, normalizePerfilFiscal } from '../../shared/fiscalProfile.js'
import {
  finalizarConsultaEnMuv,
  prestadorDesdeSesion,
  RipsMapperError,
} from '../services/consultaFinalizacionService.js'

function bearerToken(req) {
  const authHeader = req.headers.authorization ?? ''
  return authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
}

function atencionDelCuerpo(body) {
  const candidate = body.atencion ?? body.consulta ?? body.clinicalRecord
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null
  return candidate
}

function respuestaMuv(res, status, payload) {
  return res.status(status).json({
    success: payload.ok === true,
    ...payload,
  })
}

/**
 * POST /api/rips/evolucion-dictada
 * Sin factura (no obligado): genera el RIPS, lo envía al MUV y guarda CUV y estado.
 * Con factura: conserva el enrutamiento FEV o RIPS pendiente.
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
    const perfilFiscal = normalizePerfilFiscal(session.user.perfilFiscal)
    const atencion = atencionDelCuerpo(body)
    const sinFactura = !body.invoice && !isObligadoFev(perfilFiscal)

    if (atencion && sinFactura) {
      const metadatos = {
        ...(body.metadatos && typeof body.metadatos === 'object' ? body.metadatos : {}),
        perfilFiscal,
        clinicId: session.user.clinicId || session.user.id,
        professionalId: session.user.id,
      }
      try {
        const result = await finalizarConsultaEnMuv({
          atencion,
          prestador: prestadorDesdeSesion(session.user),
          metadatos,
          user: session.user,
        })
        const codes = collectExtractedCodes(result.rips ?? body.rips, {
          cie10: body.cie10,
          cups: body.cups,
          clinicalItems: body.clinicalItems,
        })
        const aprobado = result.estadoMuv === 'APROBADO'
        return respuestaMuv(res, aprobado ? 200 : 422, {
          ok: aprobado,
          route: 'muv_sin_factura',
          perfilFiscal,
          numFactura: null,
          cuv: result.cuv,
          estadoMuv: result.estadoMuv,
          resultadoValidacion: result.resultadoValidacion,
          consultaId: result.consulta?.id ?? null,
          alreadyStored: result.alreadyStored === true,
          codes,
          rips: result.rips,
          message: aprobado
            ? 'RIPS sin factura radicado en el MUV.'
            : 'El MUV rechazó el RIPS de la consulta.',
        })
      } catch (error) {
        if (error instanceof RipsMapperError || error?.name === 'RipsMapperError') {
          return respuestaMuv(res, 422, {
            ok: false,
            route: 'muv_sin_factura',
            perfilFiscal,
            estadoMuv: 'RECHAZADO',
            error: error.message,
            field: error.field ?? null,
            consultaId: error.consulta?.id ?? null,
            resultadoValidacion: error.consulta?.resultadoValidacion ?? null,
          })
        }
        if (error?.statusCode === 400 || error?.statusCode === 502 || error?.statusCode === 503) {
          return respuestaMuv(res, error.statusCode, {
            ok: false,
            route: 'muv_sin_factura',
            perfilFiscal,
            estadoMuv: error.estadoMuv ?? error.consulta?.estadoMuv ?? 'RECHAZADO',
            error: error.message,
            cuv: error.cuv ?? null,
            consultaId: error.consulta?.id ?? null,
            resultadoValidacion: error.resultadoValidacion ?? error.consulta?.resultadoValidacion ?? null,
          })
        }
        throw error
      }
    }

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
