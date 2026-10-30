-- Firmas y formularios enviados desde la tableta esclava (modo kiosco).
CREATE TABLE IF NOT EXISTS kiosk_signatures (
  id UUID PRIMARY KEY,
  clinic_id TEXT NOT NULL,
  document_type TEXT NOT NULL,
  document_id TEXT,
  patient_id TEXT,
  title TEXT,
  content_text TEXT,
  signature_base64 TEXT NOT NULL,
  form_data JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kiosk_signatures_clinic_created
  ON kiosk_signatures (clinic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_kiosk_signatures_document
  ON kiosk_signatures (clinic_id, document_type, document_id);
