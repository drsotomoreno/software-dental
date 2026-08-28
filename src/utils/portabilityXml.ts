import type { ClinicalHistoryExportPackage } from '@/types/portability'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function el(name: string, value: string | number | undefined | null, attrs = ''): string {
  if (value === undefined || value === null || value === '') return ''
  const attr = attrs ? ` ${attrs}` : ''
  return `<${name}${attr}>${escapeXml(String(value))}</${name}>`
}

export function buildPortabilityXml(pkg: ClinicalHistoryExportPackage): string {
  const { manifest, patient, clinicalRecords, integrityReport, custodyChain } = pkg

  const atenciones = clinicalRecords
    .map((record, index) => {
      const integrity = integrityReport.find((r) => r.recordId === String(record.id ?? ''))
      const diagnoses = (record.diagnoses ?? [])
        .map(
          (d) =>
            `      <Diagnostico codigo="${escapeXml(d.code)}" tipo="${escapeXml(d.type)}">${escapeXml(d.description)}</Diagnostico>`,
        )
        .join('\n')

      return `    <Atencion indice="${index + 1}" id="${escapeXml(String(record.id ?? ''))}">
      ${el('FechaFirma', record.signedAt)}
      ${el('HashContenido', record.contentHash)}
      ${el('IntegridadVerificada', integrity?.valid ? 'true' : 'false')}
      <Diagnosticos>
${diagnoses}
      </Diagnosticos>
      ${el('Hallazgos', record.findings)}
      ${el('PlanTratamiento', record.treatmentPlanNotes)}
    </Atencion>`
    })
    .join('\n')

  const custodia = custodyChain
    .map(
      (entry) => `    <Evento paso="${escapeXml(entry.step)}" fecha="${escapeXml(entry.timestamp)}">
      ${el('Descripcion', entry.description)}
      ${el('RecordId', entry.recordId)}
      ${el('Hash', entry.contentHash)}
      ${el('FirmadoPor', entry.signedBy)}
    </Evento>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<HistoriaClinicaPortabilidad xmlns="urn:dental-emr:colombia:portabilidad:1.0">
  <Metadatos>
    ${el('Formato', pkg.format)}
    ${el('Version', pkg.version)}
    ${el('ExportId', manifest.exportId)}
    ${el('ExportadoEn', manifest.exportedAt)}
    ${el('Proposito', manifest.purpose)}
    ${el('HashPaquete', manifest.packageHash)}
    ${el('Algoritmo', manifest.algorithm)}
    ${el('IntegridadVerificada', manifest.integrityVerified ? 'true' : 'false')}
    ${el('CantidadAtenciones', manifest.recordCount)}
  </Metadatos>
  <MarcoLegal>
${manifest.legalBasis.map((law) => `    ${el('Norma', law)}`).join('\n')}
  </MarcoLegal>
  <Prestador>
    ${el('Nombre', manifest.exportedBy?.name)}
    ${el('Email', manifest.exportedBy?.email)}
    ${el('Rol', manifest.exportedBy?.role)}
    ${el('RegistroProfesional', manifest.exportedBy?.professionalLicense)}
    ${el('Clinica', manifest.exportedBy?.clinicName)}
    ${el('NIT', manifest.exportedBy?.providerNit)}
  </Prestador>
  <Paciente>
    ${el('TipoDocumento', patient.documentType)}
    ${el('NumeroDocumento', patient.documentNumber)}
    ${el('Nombres', patient.firstName)}
    ${el('Apellidos', patient.lastName)}
    ${el('FechaNacimiento', patient.birthDate)}
    ${el('Genero', patient.gender)}
    ${el('Telefono', patient.phone)}
    ${el('Email', patient.email)}
    ${el('EPS', patient.insurer)}
  </Paciente>
  <Atenciones>
${atenciones}
  </Atenciones>
  <CadenaCustodia>
${custodia}
  </CadenaCustodia>
</HistoriaClinicaPortabilidad>`
}
