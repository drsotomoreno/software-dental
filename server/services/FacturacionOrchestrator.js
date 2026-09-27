import { empaquetarConCuv } from './FacturacionService.js'
import { minSaludService } from './MinSaludService.js'
import { resolveMuvAmbiente } from './muvAmbiente.js'

/**
 * Cierra el ciclo de mihistoriadental.com: CUV del MUV → CUFE y PDF de marca blanca.
 */
export class FacturacionOrchestrator {
  /**
   * @param {{ transmitir: Function }} [servicioMinsalud]
   */
  constructor(servicioMinsalud = minSaludService) {
    this.minsalud = servicioMinsalud
  }

  /**
   * @param {{ rips: object, invoice?: object, metadatos?: object, credenciales?: object }} params
   */
  async ejecutar({ rips, invoice, metadatos = {}, credenciales } = {}) {
    const ambiente = resolveMuvAmbiente()
    const ministry = await this.minsalud.transmitir({ rips, metadatos, credenciales })

    if (!ministry.success || !ministry.cuv) {
      return {
        success: false,
        approved: false,
        status: 'RECHAZADO',
        ambiente: ambiente.id,
        serie: ambiente.serie,
        source: ministry.source,
        endpoint: ministry.endpoint,
        localIssues: ministry.localIssues ?? [],
        ministryErrors: ministry.ministryErrors ?? [],
        glosas: ministry.glosas ?? [],
        httpStatus: ministry.httpStatus,
        error: 'El Ministerio no devolvió CUV.',
      }
    }

    const factura = {
      ...(invoice && typeof invoice === 'object' ? invoice : {}),
      numFactura: invoice?.numFactura ?? invoice?.invoiceNumber ?? rips?.numFactura,
    }
    const billing = await empaquetarConCuv({
      cuv: ministry.cuv,
      invoice: factura,
      provider: invoice?.provider,
      ambiente: ambiente.id,
      serie: ambiente.serie,
    })

    if (!billing.success) {
      return {
        success: false,
        approved: false,
        status: 'RECHAZADO',
        cuv: ministry.cuv,
        ambiente: ambiente.id,
        serie: ambiente.serie,
        source: ministry.source,
        procesoId: ministry.procesoId,
        fechaRadicacion: ministry.fechaRadicacion,
        estado: ministry.estado,
        glosas: ministry.glosas ?? [],
        error: billing.error,
      }
    }

    return {
      status: 'EXITOSO',
      success: true,
      approved: true,
      cuv: ministry.cuv,
      cufe: billing.cufe,
      pdfUrl: billing.pdfUrl,
      provider: billing.provider,
      ambiente: ambiente.id,
      serie: ambiente.serie,
      glosas: [],
      procesoId: ministry.procesoId,
      fechaRadicacion: ministry.fechaRadicacion,
      estado: ministry.estado,
      source: ministry.source,
      endpoint: ministry.endpoint,
      localIssues: ministry.localIssues ?? [],
      metadatos: ministry.metadatos,
    }
  }
}

export const facturacionOrchestrator = new FacturacionOrchestrator()
