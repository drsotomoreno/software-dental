-- Ficha clínica por paciente (RDS). Idempotente. No DROP / TRUNCATE.
-- La lectura individual (GET /api/patients/:id/chart) usa esta tabla.
-- clinical-sync.json queda como espejo adelgazado, sin base64 de anexos.

CREATE TABLE IF NOT EXISTS patient_clinical_charts (
  clinica_id TEXT NOT NULL,
  patient_sync_id TEXT NOT NULL,
  document_number TEXT,
  clinical_revision INTEGER NOT NULL DEFAULT 1,
  content_hash TEXT NOT NULL,
  chart_data JSONB NOT NULL,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (clinica_id, patient_sync_id)
);

CREATE INDEX IF NOT EXISTS patient_clinical_charts_document_idx
  ON patient_clinical_charts (clinica_id, document_number);

COMMENT ON TABLE patient_clinical_charts IS
  'Historia clínica por paciente y sede. Control optimista por clinical_revision.';
