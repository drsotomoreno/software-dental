import { randomUUID } from 'node:crypto'
import { config } from '../config.js'
import {
  DIAN_IVA_TRIBUTO_CODIGO,
  DIAN_IVA_TRIBUTO_NOMBRE,
  DIAN_IVA_EXCLUIDO_PERCENT,
  DIAN_IVA_EXCLUIDO_NORMA,
  buildExcludedIvaBreakdown,
} from '../../shared/dianHealthTax.js'

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function moneyXml(value) {
  const n = Number(value)
  const safe = Number.isFinite(n) ? n : 0
  return safe.toFixed(2)
}

function excludedIvaTaxTotalXml(baseAmount, indent = '  ') {
  const iva = buildExcludedIvaBreakdown(baseAmount)
  return `${indent}<cac:TaxTotal>
${indent}  <cbc:TaxAmount currencyID="COP">${moneyXml(iva.valorImpuesto)}</cbc:TaxAmount>
${indent}  <cac:TaxSubtotal>
${indent}    <cbc:TaxableAmount currencyID="COP">${moneyXml(iva.baseImponible)}</cbc:TaxableAmount>
${indent}    <cbc:TaxAmount currencyID="COP">${moneyXml(iva.valorImpuesto)}</cbc:TaxAmount>
${indent}    <cac:TaxCategory>
${indent}      <cbc:Percent>${DIAN_IVA_EXCLUIDO_PERCENT}</cbc:Percent>
${indent}      <cbc:TaxExemptionReason>${escapeXml(`${DIAN_IVA_TRIBUTO_NOMBRE} excluido — ${DIAN_IVA_EXCLUIDO_NORMA}`)}</cbc:TaxExemptionReason>
${indent}      <cac:TaxScheme>
${indent}        <cbc:ID>${DIAN_IVA_TRIBUTO_CODIGO}</cbc:ID>
${indent}        <cbc:Name>${DIAN_IVA_TRIBUTO_NOMBRE}</cbc:Name>
${indent}      </cac:TaxScheme>
${indent}    </cac:TaxCategory>
${indent}  </cac:TaxSubtotal>
${indent}</cac:TaxTotal>`
}

/**
 * Construye XML UBL 2.1 de Factura Electrónica de Venta en Salud (FEV-Salud)
 * con el CUV inyectado en el anexo normativo del sector salud (Res. 2275 / Anexo técnico DIAN).
 *
 * Tributo IVA código `01`, tarifa `0.00%` (servicios de salud excluidos, ET Art. 476).
 * BaseImponible = ValorTotal; ValorImpuesto = 0.00.
 *
 * @param {object} params
 * @param {string} params.cuv
 * @param {string} params.numFactura
 * @param {string} params.nitEmisor
 * @param {string} params.razonSocialEmisor
 * @param {string} params.nitAdquiriente
 * @param {string} params.razonSocialAdquiriente
 * @param {string} params.issueDate
 * @param {number} params.payableAmount
 * @param {Array<{description:string,quantity:number,unitPrice:number,cupsCode?:string}>} params.lines
 */
export function buildDianHealthInvoiceXml({
  cuv,
  numFactura,
  nitEmisor,
  razonSocialEmisor,
  nitAdquiriente,
  razonSocialAdquiriente,
  issueDate,
  payableAmount,
  lines = [],
}) {
  if (!cuv?.trim()) {
    throw new Error('El CUV es obligatorio para generar la FEV-Salud ante la DIAN.')
  }

  const uuid = randomUUID()
  const iva = buildExcludedIvaBreakdown(payableAmount)

  const lineXml = lines
    .map((line, index) => {
      const qty = line.quantity ?? 1
      const price = line.unitPrice ?? 0
      const lineExtension = qty * price
      return `
    <cac:InvoiceLine>
      <cbc:ID>${index + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="NIU">${qty}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="COP">${moneyXml(lineExtension)}</cbc:LineExtensionAmount>
${excludedIvaTaxTotalXml(lineExtension, '      ')}
      <cac:Item>
        <cbc:Description>${escapeXml(line.description)}</cbc:Description>
        ${line.cupsCode ? `<cac:SellersItemIdentification><cbc:ID>${escapeXml(line.cupsCode)}</cbc:ID></cac:SellersItemIdentification>` : ''}
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="COP">${moneyXml(price)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
         xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"
         xmlns:sts="dian:gov:co:facturaelectronica:Structures-2-1"
         xmlns:salud="urn:salud:colombia:fev:1.0">
  <ext:UBLExtensions>
    <ext:UBLExtension>
      <ext:ExtensionContent>
        <sts:DianExtensions>
          <sts:SoftwareProvider>
            <sts:SoftwareID>${escapeXml(config.dian.softwareId)}</sts:SoftwareID>
          </sts:SoftwareProvider>
        </sts:DianExtensions>
        <salud:SectorSalud>
          <salud:CodigoUnicoValidacion>${escapeXml(cuv)}</salud:CodigoUnicoValidacion>
          <salud:NumeroFacturaVinculada>${escapeXml(numFactura)}</salud:NumeroFacturaVinculada>
          <salud:ResolucionAplicable>Resolución 2275 de 2023</salud:ResolucionAplicable>
        </salud:SectorSalud>
      </ext:ExtensionContent>
    </ext:UBLExtension>
  </ext:UBLExtensions>
  <cbc:UBLVersionID>UBL 2.1</cbc:UBLVersionID>
  <cbc:CustomizationID>10</cbc:CustomizationID>
  <cbc:ProfileID>DIAN 2.1: Factura Electrónica de Venta</cbc:ProfileID>
  <cbc:ProfileExecutionID>1</cbc:ProfileExecutionID>
  <cbc:ID>${escapeXml(numFactura)}</cbc:ID>
  <cbc:UUID schemeName="CUFE-SHA384">${escapeXml(uuid)}</cbc:UUID>
  <cbc:IssueDate>${escapeXml(issueDate)}</cbc:IssueDate>
  <cbc:InvoiceTypeCode>01</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>COP</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(razonSocialEmisor)}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="31">${escapeXml(nitEmisor)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyTaxScheme>
        <cbc:RegistrationName>${escapeXml(razonSocialAdquiriente)}</cbc:RegistrationName>
        <cbc:CompanyID>${escapeXml(nitAdquiriente)}</cbc:CompanyID>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>
${excludedIvaTaxTotalXml(iva.valorTotal, '  ')}
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="COP">${moneyXml(iva.valorTotal)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="COP">${moneyXml(iva.valorTotal)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="COP">${moneyXml(iva.valorTotal)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="COP">${moneyXml(iva.valorTotal)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lineXml}
</Invoice>`
}
