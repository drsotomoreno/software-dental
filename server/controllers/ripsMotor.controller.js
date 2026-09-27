import { saveCuvRecord } from '../services/cuvRepository.js'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { empaquetarConCuv } from '../services/FacturacionService.js'
import { obtenerTokenSISPRO } from '../services/MinSaludAuthService.js'
import { cargarFevRips } from '../services/MinSaludService.js'

function metadatosSinSecretos(metadatos) {
  if (!metadatos || typeof metadatos !== 'object') return metadatos
  const rest = { ...metadatos }
  delete rest.credencialesSispro
  delete rest.credencialesDescifradas
  delete rest.clave
  delete rest.password
  return rest
}

/**
 * Flujo oficial: SISPRO → CargarFevRips (CUV) → proveedor (CUFE + pdfUrl).
 * @param {{ rips: object, invoice?: object, metadatos?: object }} params
 */
export async function ejecutarFlujoOficial({ rips, invoice, metadatos = {} }) {
  const credenciales = metadatos.credencialesSispro ?? metadatos.credencialesDescifradas
  const trazabilidad = metadatosSinSecretos(metadatos)

  // Paso A — autenticarse en SISPRO con las credenciales descifradas del prestador.
  const token = await obtenerTokenSISPRO(credenciales)
  if (!token) {
    return {
      success: false,
      approved: false,
      error: 'No se obtuvo el token SISPRO.',
    }
  }

  // Paso B — transmitir el JSON y obtener el CUV.
  const ministry = await cargarFevRips({ rips, metadatos: trazabilidad, credenciales })
  if (!ministry.success || !ministry.cuv) {
    return {
      success: false,
      approved: false,
      source: ministry.source,
      localIssues: ministry.localIssues ?? [],
      ministryErrors: ministry.ministryErrors ?? [],
      error: 'El Ministerio no devolvió CUV.',
    }
  }

  const cuvRecord = await saveCuvRecord({
    cuv: ministry.cuv,
    numFactura: rips.numFactura,
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    status: 'approved',
    procesoId: ministry.procesoId,
    fechaRadicacion: ministry.fechaRadicacion,
    estado: ministry.estado,
    source: ministry.source,
    metadatos: { ...trazabilidad, ...ministry.metadatos, endpoint: ministry.endpoint },
    clinicalRecordIds: metadatos?.clinicalRecordIds ?? [],
    patientUuid: metadatos?.patientUuid ?? null,
  })

  // Paso C — el CUV entra al proveedor tecnológico.
  const billing = await empaquetarConCuv({
    cuv: ministry.cuv,
    invoice: {
      ...(invoice && typeof invoice === 'object' ? invoice : {}),
      numFactura: invoice?.numFactura ?? invoice?.invoiceNumber ?? rips.numFactura,
    },
    provider: invoice?.provider,
  })
  if (!billing.success) {
    return {
      success: false,
      approved: false,
      cuv: ministry.cuv,
      cuvRecordId: cuvRecord.id,
      error: billing.error,
    }
  }

  let dianXml = null
  if (invoice) {
    dianXml = buildDianHealthInvoiceXml({
      cuv: ministry.cuv,
      numFactura: rips.numFactura,
      ...invoice,
    })
    cuvRecord.dianXmlGenerated = true
  }

  // Paso D — respuesta consolidada para el frontend.
  return {
    status: 'EXITOSO',
    success: true,
    approved: true,
    cuv: ministry.cuv,
    cufe: billing.cufe,
    pdfUrl: billing.pdfUrl,
    provider: billing.provider,
    procesoId: ministry.procesoId,
    fechaRadicacion: ministry.fechaRadicacion,
    estado: ministry.estado,
    source: ministry.source,
    localWarnings: ministry.localIssues ?? [],
    cuvRecordId: cuvRecord.id,
    dianXml,
  }
}

/**
 * POST /api/rips/validate
 */
export async function transmitirFevRips(req, res, next) {
  try {
    const { rips, metadatos, invoice } = req.body ?? {}
    if (!rips) {
      return res.status(400).json({ success: false, error: 'El cuerpo debe incluir el objeto rips.' })
    }

    const result = await ejecutarFlujoOficial({ rips, invoice, metadatos })
    if (!result.success) {
      const status = result.cuv && !result.cufe ? 502 : 422
      return res.status(status).json({
        success: false,
        approved: false,
        source: result.source,
        localIssues: result.localIssues ?? [],
        ministryErrors: result.ministryErrors ?? [],
        error: result.error,
        cuv: result.cuv,
      })
    }

    return res.json(result)
  } catch (error) {
    next(error)
  }
}
