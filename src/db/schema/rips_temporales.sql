-- Referencia SQLite — RIPS temporales (pre-FEV o prestador No_Obligado)
-- Persistencia operativa en cliente: Dexie `ripsTemporales`
-- Res. 2275: num_factura DEBE aceptar NULL.

CREATE TABLE IF NOT EXISTS rips_temporales (
  id TEXT PRIMARY KEY NOT NULL,
  clinic_id TEXT NOT NULL,
  patient_id TEXT,
  professional_id TEXT,
  clinical_record_id TEXT,
  num_documento_id_obligado TEXT NOT NULL,
  -- Null permitido: No_Obligado o RIPS previo a la emisión de la FEV.
  num_factura TEXT,
  tipo_nota TEXT,
  num_nota TEXT,
  perfil_fiscal TEXT NOT NULL DEFAULT 'Obligado_FEV'
    CHECK (perfil_fiscal IN ('Obligado_FEV', 'No_Obligado')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'ready', 'pendiente', 'submitted', 'linked_to_invoice')),
  rips_json TEXT NOT NULL,
  invoice_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  submitted_at TEXT,
  CHECK (
    perfil_fiscal = 'No_Obligado'
    OR status IN ('draft', 'ready')
    OR (num_factura IS NOT NULL AND TRIM(num_factura) <> '')
  )
);

CREATE INDEX IF NOT EXISTS idx_rips_temporales_clinic_status
  ON rips_temporales (clinic_id, status);

CREATE INDEX IF NOT EXISTS idx_rips_temporales_patient
  ON rips_temporales (patient_id);

CREATE INDEX IF NOT EXISTS idx_rips_temporales_factura
  ON rips_temporales (num_factura)
  WHERE num_factura IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rips_temporales_created
  ON rips_temporales (created_at);
