-- Bitácora médico-legal append-only (Resolución 1995 de 1999).
-- Idempotente: seguro re-ejecutar en AWS RDS. No DROP / TRUNCATE / ALTER destructivo.

CREATE TABLE IF NOT EXISTS clinical_audit_logs (
  id UUID PRIMARY KEY,
  patient_sync_id TEXT NOT NULL,
  clinica_id TEXT NOT NULL,
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  clinical_revision INTEGER NOT NULL DEFAULT 0,
  content_hash TEXT NOT NULL DEFAULT '',
  changed_sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  source TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Consultas por clínica + paciente + tiempo (listados / auditoría forense).
CREATE INDEX IF NOT EXISTS clinical_audit_logs_clinica_patient_created_idx
  ON clinical_audit_logs (clinica_id, patient_sync_id, created_at DESC);

-- Compatibilidad con despliegues previos (índices simples).
CREATE INDEX IF NOT EXISTS clinical_audit_logs_patient_created_idx
  ON clinical_audit_logs (patient_sync_id, created_at DESC);

CREATE INDEX IF NOT EXISTS clinical_audit_logs_clinica_created_idx
  ON clinical_audit_logs (clinica_id, created_at DESC);

-- Búsqueda / dedupe forense por hash de contenido clínico.
CREATE INDEX IF NOT EXISTS clinical_audit_logs_content_hash_idx
  ON clinical_audit_logs (content_hash);

COMMENT ON TABLE clinical_audit_logs IS
  'Append-only clinical edit audit trail (Res. 1995). Never update or delete rows.';
