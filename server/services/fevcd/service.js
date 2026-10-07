import { createHash } from 'node:crypto'
import { buildCompraDirecta } from './catalogs.js'
import { createFevcdClient } from './client.js'
import { ambientePermitido, resolveFevcdSettings } from './settings.js'

/**
 * Flujo de compra directa: valida la estructura, carga el XML y, si el
 * ambiente preliminar no responde, consulta el mismo GUID antes de reenviar.
 *
 * @param {object} input
 * @param {object} [deps]
 */
export async function enviarCompraDirecta(input, deps = {}) {
  const settings = deps.settings ?? resolveFevcdSettings()
  const built = buildCompraDirecta(input)
  const errores = built.issues.filter((item) => item.level === 'error')
  if (errores.length > 0 || !built.document) {
    return {
      success: false,
      source: 'local',
      ambiente: settings.ambiente,
      preliminar: settings.preliminar,
      issues: built.issues,
      rechazos: errores,
    }
  }

  const gate = ambientePermitido(settings)
  if (!gate.ok) {
    return {
      success: false,
      source: 'local',
      ambiente: settings.ambiente,
      preliminar: settings.preliminar,
      rechazos: [{
        clase: 'RECHAZADO',
        codigo: gate.codigo,
        descripcion: gate.descripcion,
        observaciones: '',
        pathFuente: 'ambiente',
        fuente: 'FEVCD',
      }],
    }
  }

  if (settings.sandbox) {
    const sha256 = createHash('sha256').update(built.document.xml, 'utf8').digest('hex')
    return {
      success: true,
      source: 'sandbox',
      ambiente: settings.ambiente,
      preliminar: settings.preliminar,
      sinRips: true,
      tecnologia: built.document.tecnologia,
      tipoDocumento: built.document.tipoDocumento,
      cucon: built.document.cucon,
      sha256,
      guid: built.document.guid ?? `sandbox-${sha256.slice(0, 12)}`,
      cuv: sha256.padEnd(96, '0').slice(0, 96),
      duplicado: false,
      notificaciones: [],
      rechazos: [],
    }
  }

  const client = deps.client ?? createFevcdClient({ settings, ...deps })
  const result = await client.cargar(built.document)
  return {
    ...result,
    source: 'fevcd',
    ambiente: settings.ambiente,
    preliminar: settings.preliminar,
    tecnologia: built.document.tecnologia,
    tipoDocumento: built.document.tipoDocumento,
    cucon: built.document.cucon,
  }
}

/**
 * @param {object} consulta
 * @param {object} [deps]
 */
export async function consultarCompraDirecta(consulta, deps = {}) {
  const settings = deps.settings ?? resolveFevcdSettings()
  const gate = ambientePermitido(settings)
  if (!gate.ok) {
    return { success: false, source: 'local', rechazos: [gate] }
  }
  if (settings.sandbox) {
    return {
      success: true,
      source: 'sandbox',
      ambiente: settings.ambiente,
      consulta,
      cuv: null,
      notificaciones: [],
      rechazos: [],
    }
  }
  const client = deps.client ?? createFevcdClient({ settings, ...deps })
  const result = await client.consultar(consulta)
  return { ...result, source: 'fevcd', ambiente: settings.ambiente }
}
