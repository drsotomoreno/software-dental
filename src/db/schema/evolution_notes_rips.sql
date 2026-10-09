-- Referencia relacional — Notas de evolución como fuente de verdad de RIPS (Res. 2275)
-- Persistencia operativa en cliente: Dexie v29
--   evolution_notes
--   rips_consultations   (índice ÚNICO evolution_note_id → 0..1 consulta)
--   rips_procedures      (índice evolution_note_id → 0..N procedimientos)
--
-- SQLite no activa claves foráneas salvo `PRAGMA foreign_keys = ON`.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS evolution_notes (
  id TEXT PRIMARY KEY NOT NULL,
  patient_id TEXT NOT NULL,
  clinical_record_id TEXT,
  clinical_evolution_note_id TEXT,
  professional_id TEXT,
  clinic_id TEXT,
  main_diagnosis_cie10 TEXT NOT NULL,
  related_diagnoses_cie10 TEXT NOT NULL,
  purpose_of_care TEXT NOT NULL,
  date_time TEXT NOT NULL,
  procedures_cups TEXT NOT NULL,
  consultation_cups TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(id)) > 0),
  CHECK (length(trim(patient_id)) > 0),
  CHECK (length(trim(main_diagnosis_cie10)) > 0),
  CHECK (length(trim(purpose_of_care)) > 0),
  CHECK (length(trim(date_time)) > 0)
);

CREATE INDEX IF NOT EXISTS idx_evolution_notes_patient_date
  ON evolution_notes (patient_id, date_time);

CREATE INDEX IF NOT EXISTS idx_evolution_notes_clinical_folio
  ON evolution_notes (clinical_evolution_note_id);

CREATE TABLE IF NOT EXISTS rips_consultations (
  id TEXT PRIMARY KEY NOT NULL,
  evolution_note_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  fecha_inicio_atencion TEXT NOT NULL,
  finalidad_tecnologia_salud TEXT NOT NULL,
  cod_diagnostico_principal TEXT NOT NULL,
  cod_diagnostico_relacionado_1 TEXT,
  cod_diagnostico_relacionado_2 TEXT,
  cod_diagnostico_relacionado_3 TEXT,
  cod_consulta TEXT NOT NULL,
  vr_servicio REAL NOT NULL DEFAULT 0,
  consecutivo INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(evolution_note_id)) > 0),
  FOREIGN KEY (evolution_note_id) REFERENCES evolution_notes (id)
);

-- Una nota de evolución genera como máximo una consulta RIPS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_rips_consultations_evolution_note
  ON rips_consultations (evolution_note_id);

CREATE INDEX IF NOT EXISTS idx_rips_consultations_patient
  ON rips_consultations (patient_id);

CREATE TABLE IF NOT EXISTS rips_procedures (
  id TEXT PRIMARY KEY NOT NULL,
  evolution_note_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  fecha_inicio_atencion TEXT NOT NULL,
  finalidad_tecnologia_salud TEXT NOT NULL,
  cod_diagnostico_principal TEXT NOT NULL,
  cod_diagnostico_relacionado TEXT,
  cod_procedimiento TEXT NOT NULL,
  pieza_dental INTEGER,
  cuadrante_fdi TEXT,
  arcada TEXT,
  vr_servicio REAL NOT NULL DEFAULT 0,
  consecutivo INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK (length(trim(evolution_note_id)) > 0),
  CHECK (arcada IS NULL OR arcada IN ('superior', 'inferior')),
  FOREIGN KEY (evolution_note_id) REFERENCES evolution_notes (id)
);

-- N procedimientos por nota: la consulta por evolution_note_id usa este índice.
CREATE INDEX IF NOT EXISTS idx_rips_procedures_evolution_note
  ON rips_procedures (evolution_note_id);

CREATE INDEX IF NOT EXISTS idx_rips_procedures_patient
  ON rips_procedures (patient_id);
