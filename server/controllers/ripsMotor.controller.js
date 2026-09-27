import { saveCuvRecord } from '../services/cuvRepository.js'
import { buildDianHealthInvoiceXml } from '../services/dianFeXmlBuilder.js'
import { facturacionOrchestrator } from '../services/FacturacionOrchestrator.js'

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

  const ciclo = await facturacionOrchestrator.ejecutar({
    rips,
    invoice,
    metadatos: trazabilidad,
    credenciales,
  })

  if (!ciclo.cuv) {
    return ciclo
  }

  const cuvRecord = await saveCuvRecord({
    cuv: ciclo.cuv,
    numFactura: rips.numFactura,
    numDocumentoIdObligado: rips.numDocumentoIdObligado,
    status: ciclo.success ? 'approved' : 'cuv-sin-cufe',
    procesoId: ciclo.procesoId,
    fechaRadicacion: ciclo.fechaRadicacion,
    estado: ciclo.estado,
    source: ciclo.source,
    metadatos: { ...trazabilidad, endpoint: ciclo.endpoint, ambiente: ciclo.ambiente, serie: ciclo.serie },
    clinicalRecordIds: metadatos?.clinicalRecordIds ?? [],
    patientUuid: metadatos?.patientUuid ?? null,
  })

  if (!ciclo.success) {
    return { ...ciclo, cuvRecordId: cuvRecord.id }
  }

  let dianXml = null
  if (invoice) {
    dianXml = buildDianHealthInvoiceXml({
      cuv: ciclo.cuv,
      numFactura: rips.numFactura,
      ...invoice,
    })
    cuvRecord.dianXmlGenerated = true
  }

  return {
    ...ciclo,
    localWarnings: ciclo.localIssues ?? [],
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
        ambiente: result.ambiente,
        serie: result.serie,
        localIssues: result.localIssues ?? [],
        ministryErrors: result.ministryErrors ?? [],
        glosas: result.glosas ?? [],
        error: result.error,
        cuv: result.cuv,
      })
    }

    return res.json(result)
  } catch (error) {
    next(error)
  }
}
