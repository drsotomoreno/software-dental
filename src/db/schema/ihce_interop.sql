-- Referencia SQLite — interoperabilidad IHCE / RDA (Res. 1888 de 2025).
-- La app web usa Dexie/IndexedDB (`ihceConsents`, `ihceRdaRecords`) con campos equivalentes.

CREATE TABLE IF NOT EXISTS ihce_consents (
  id                   TEXT PRIMARY KEY NOT NULL,
  patient_id           TEXT NOT NULL,
  document_type        TEXT NOT NULL,
  document_number      TEXT NOT NULL,
  requested_at         TEXT NOT NULL,
  expires_at           TEXT NOT NULL,
  authorized_at        TEXT,
  consumed_at          TEXT,
  ip_address           TEXT NOT NULL,
  user_agent           TEXT NOT NULL,
  requested_by_user_id TEXT,
  masked_phone         TEXT NOT NULL,
  otp_hash             TEXT,
  consent_hash         TEXT NOT NULL,
  nonce                TEXT NOT NULL,
  status               TEXT NOT NULL CHECK (
                         status IN ('pending', 'authorized', 'denied', 'expired', 'consumed')
                       ),
  attempt_count        INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_ihce_consents_patient
  ON ihce_consents (patient_id);

CREATE INDEX IF NOT EXISTS idx_ihce_consents_document
  ON ihce_consents (document_number);

CREATE INDEX IF NOT EXISTS idx_ihce_consents_status
  ON ihce_consents (status);

CREATE INDEX IF NOT EXISTS idx_ihce_consents_requested
  ON ihce_consents (requested_at);

CREATE INDEX IF NOT EXISTS idx_ihce_consents_expires
  ON ihce_consents (expires_at);

CREATE TABLE IF NOT EXISTS ihce_rda_records (
  id               TEXT PRIMARY KEY NOT NULL,
  patient_id       TEXT NOT NULL,
  document_number  TEXT NOT NULL,
  consent_id       TEXT NOT NULL,
  downloaded_at    TEXT NOT NULL,
  source           TEXT NOT NULL DEFAULT 'minsalud-simulado',
  payload_hash     TEXT NOT NULL,
  diagnoses_json   TEXT NOT NULL,
  procedures_json  TEXT NOT NULL,
  composition_id   TEXT,
  raw_bundle_json  TEXT
);

CREATE INDEX IF NOT EXISTS idx_ihce_rda_patient
  ON ihce_rda_records (patient_id);

CREATE INDEX IF NOT EXISTS idx_ihce_rda_document
  ON ihce_rda_records (document_number);

CREATE INDEX IF NOT EXISTS idx_ihce_rda_downloaded
  ON ihce_rda_records (downloaded_at);

CREATE INDEX IF NOT EXISTS idx_ihce_rda_consent
  ON ihce_rda_records (consent_id);
