function recordPayload(record) {
  if (!record || typeof record !== 'object') return {}
  const payload = record.payload
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) return payload
  return record
}

export function odontogramRecordHasMarks(record) {
  const data = recordPayload(record)
  if (data.edentulismScope) return true

  const findings = data.supplementaryFindings
  if (findings && typeof findings === 'object') {
    for (const finding of Object.values(findings)) {
      if (!finding || typeof finding !== 'object') continue
      if (finding.present || String(finding.description || '').trim()) return true
    }
  }

  const teeth = Array.isArray(data.teeth) ? data.teeth : []
  return teeth.some((tooth) => {
    if (!tooth || typeof tooth !== 'object') return false
    if (tooth.globalState && tooth.globalState !== 'presente') return true
    const faces = tooth.faces
    if (!faces || typeof faces !== 'object') return false
    return Object.values(faces).some((face) => face && face !== 'sano')
  })
}

export function draftRecordHasDiagnoses(record) {
  const data = recordPayload(record)
  return [data, data.clinicalDraft, data.valuationDraft].some((source) => {
    if (!source || typeof source !== 'object') return false
    if (Array.isArray(source.diagnoses) && source.diagnoses.length > 0) return true
    const entries = source.diagnosticChart?.entries
    if (Array.isArray(entries) && entries.length > 0) return true
    if (typeof source.findings === 'string' && source.findings.trim()) return true
    return false
  })
}
