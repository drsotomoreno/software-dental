import type { ClinicalHistoryExportPackage } from '@/types/portability'
import { APP_NAME } from '@/constants/branding'
import { formatDate } from './crypto'
import { getEvolutionCatalogServices } from '@/utils/evolutionCatalogServices'

function truncateHash(hash?: string, len = 16): string {
  if (!hash) return '—'
  return `${hash.slice(0, len)}…`
}

export function buildPortabilityHtml(pkg: ClinicalHistoryExportPackage): string {
  const { manifest, patient, clinicalRecords, integrityReport, custodyChain } = pkg
  const fullName = `${patient.firstName} ${patient.lastName}`

  const recordsHtml = clinicalRecords
    .map((record, index) => {
      const integrity = integrityReport.find((r) => r.recordId === String(record.id ?? ''))
      const diagnoses = (record.diagnoses ?? [])
        .map((d) => `<li><strong>${d.code}</strong> — ${d.description} (${d.type})</li>`)
        .join('')

      const notes = (record.evolutionNotes ?? [])
        .map((n) => {
          const catalogServices = getEvolutionCatalogServices(n)
          const procedureLabel =
            catalogServices.length > 0
              ? catalogServices
                  .map((service) => service.serviceName || service.procedure)
                  .filter(Boolean)
                  .join(' · ')
              : n.procedure
          return `<tr><td>${formatDate(n.date || n.createdAt)}</td><td>${procedureLabel}</td><td>${n.prescriptions || '—'}</td></tr>`
        })
        .join('')

      return `
      <section class="record">
        <h3>Atención ${index + 1} — ${record.signedAt ? formatDate(record.signedAt) : 'Sin fecha'}</h3>
        <p class="integrity ${integrity?.valid ? 'ok' : 'fail'}">
          ${integrity?.valid ? '✓ Integridad verificada (SHA-256)' : '⚠ Integridad no verificada'}
          · Hash: <code>${truncateHash(record.contentHash, 32)}</code>
        </p>
        <h4>Diagnósticos CIE-10</h4>
        <ul>${diagnoses || '<li>Sin diagnósticos registrados</li>'}</ul>
        <h4>Hallazgos</h4>
        <p>${record.findings || '—'}</p>
        <h4>Plan de tratamiento</h4>
        <p>${record.treatmentPlanNotes || '—'}</p>
        ${
          notes
            ? `<h4>Notas de evolución</h4>
        <table><thead><tr><th>Fecha</th><th>Procedimiento</th><th>Prescripciones</th></tr></thead><tbody>${notes}</tbody></table>`
            : ''
        }
      </section>`
    })
    .join('')

  const custodyHtml = custodyChain
    .map(
      (e) =>
        `<li><strong>${formatDate(e.timestamp)}</strong> — ${e.description}${e.contentHash ? ` <code>${truncateHash(e.contentHash)}</code>` : ''}</li>`,
    )
    .join('')

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <title>Historia Clínica — ${fullName}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 800px; margin: 2rem auto; color: #1e293b; line-height: 1.5; }
    h1 { font-size: 1.5rem; border-bottom: 2px solid #0d9488; padding-bottom: 0.5rem; }
    h2 { font-size: 1.1rem; margin-top: 1.5rem; color: #0f766e; }
    h3 { font-size: 1rem; margin-top: 1rem; }
    h4 { font-size: 0.9rem; margin: 0.75rem 0 0.25rem; }
    .meta, .legal { font-size: 0.85rem; color: #475569; }
    .record { border: 1px solid #e2e8f0; border-radius: 8px; padding: 1rem; margin: 1rem 0; page-break-inside: avoid; }
    .integrity.ok { color: #15803d; }
    .integrity.fail { color: #b91c1c; }
    code { font-family: monospace; font-size: 0.75rem; background: #f1f5f9; padding: 0.1rem 0.3rem; }
    table { width: 100%; border-collapse: collapse; font-size: 0.85rem; margin-top: 0.5rem; }
    th, td { border: 1px solid #e2e8f0; padding: 0.35rem 0.5rem; text-align: left; }
    th { background: #f8fafc; }
    footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; font-size: 0.75rem; color: #64748b; }
    @media print { body { margin: 1cm; } }
  </style>
</head>
<body>
  <h1>Exportación de Historia Clínica Odontológica</h1>
  <p class="meta">Resumen Digital de Atención (RDA) · Generado ${formatDate(manifest.exportedAt)}</p>

  <h2>Datos del paciente</h2>
  <p><strong>${fullName}</strong><br />
  ${patient.documentType} ${patient.documentNumber} · Nacimiento: ${patient.birthDate}<br />
  Tel: ${patient.phone}${patient.insurer ? ` · EPS: ${patient.insurer}` : ''}</p>

  <h2>Prestador / custodio</h2>
  <p>${manifest.exportedBy?.name ?? '—'}<br />
  ${manifest.exportedBy?.clinicName ?? ''}${manifest.exportedBy?.professionalLicense ? ` · R.P. ${manifest.exportedBy.professionalLicense}` : ''}</p>

  <h2>Marco legal</h2>
  <ul class="legal">
    ${manifest.legalBasis.map((l) => `<li>${l}</li>`).join('')}
  </ul>

  <h2>Historial de atenciones (${clinicalRecords.length})</h2>
  ${recordsHtml || '<p>No hay atenciones firmadas registradas.</p>'}

  <h2>Cadena de custodia</h2>
  <ol>${custodyHtml}</ol>

  <h2>Integridad del paquete</h2>
  <p>Hash del paquete (SHA-256): <code>${manifest.packageHash}</code><br />
  Estado: ${manifest.integrityVerified ? 'Todas las atenciones verificadas' : 'Se detectaron inconsistencias'}</p>

  <footer>
    Documento generado por ${APP_NAME}. La historia clínica es propiedad del paciente;
    el prestador actúa como custodio. Este informe puede imprimirse o guardarse como PDF desde el navegador.
    ID exportación: ${manifest.exportId}
  </footer>
</body>
</html>`
}

export function openPortabilityHtmlForPrint(html: string): void {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(html)
  win.document.close()
  win.focus()
  setTimeout(() => win.print(), 400)
}
