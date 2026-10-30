-- Pacientes capturados desde Modo Kiosco (tableta).
-- La firma de anamnesis/consentimiento se guarda en TEXT (Base64).
-- Idempotente: se puede reejecutar sobre AWS RDS.

CREATE TABLE IF NOT EXISTS patients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinic_id TEXT NOT NULL,
    sync_id TEXT NOT NULL,
    document_type TEXT NOT NULL,
    document_number TEXT NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    phone TEXT,
    anamnesis JSONB NOT NULL DEFAULT '{}'::jsonb,
    signature_base64 TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'kiosk',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS patients_sync_id_uidx ON patients (sync_id);

CREATE INDEX IF NOT EXISTS patients_clinic_id_idx ON patients (clinic_id);

CREATE INDEX IF NOT EXISTS patients_clinic_document_idx
    ON patients (clinic_id, document_number);

COMMENT ON TABLE patients IS
    'Altas de pacientes (p. ej. kiosco). El pull clínico sigue leyendo clinical-sync / app_json_store.';

COMMENT ON COLUMN patients.signature_base64 IS
    'Firma del paciente en Base64 (data URL o PNG crudo) capturada en kiosco.';
