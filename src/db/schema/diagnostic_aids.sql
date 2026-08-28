-- Referencia SQLite para versión de escritorio (Electron).
-- En la SPA actual el equivalente es la tabla Dexie `diagnosticAids`.

CREATE TABLE IF NOT EXISTS diagnostic_aids (
  id            TEXT PRIMARY KEY NOT NULL,
  patient_id    TEXT NOT NULL,
  encounter_id  TEXT NOT NULL,
  file_type     TEXT NOT NULL CHECK (file_type IN ('DICOM', 'STL', 'IMG', 'OTHER')),
  file_name     TEXT NOT NULL,
  absolute_path TEXT NOT NULL,
  file_hash     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  comments      TEXT NOT NULL DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_diagnostic_aids_patient
  ON diagnostic_aids (patient_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_aids_encounter
  ON diagnostic_aids (encounter_id);

CREATE INDEX IF NOT EXISTS idx_diagnostic_aids_created
  ON diagnostic_aids (created_at);
