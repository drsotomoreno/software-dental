-- EMR v2 — assets clínicos (cero base64 en BD) + índices de aislamiento.
-- Idempotente: seguro re-ejecutar en AWS RDS. No DROP / TRUNCATE.

DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION
    WHEN OTHERS THEN
        RAISE NOTICE 'pgcrypto no disponible; se usa gen_random_uuid() del núcleo de PostgreSQL';
END $$;

CREATE TABLE IF NOT EXISTS emr_v2_clinical_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id TEXT NOT NULL,
    patient_id UUID NOT NULL REFERENCES emr_v2_patients(id),
    asset_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    sha256_hash TEXT NOT NULL,
    storage_driver TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    uploaded_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT emr_v2_clinical_assets_type_chk CHECK (
        asset_type IN (
            'radiografia',
            'foto_clinica',
            'firma_paciente',
            'firma_profesional',
            'consentimiento_pdf',
            'anexo'
        )
    ),
    CONSTRAINT emr_v2_clinical_assets_driver_chk CHECK (
        storage_driver IN ('s3', 'disk')
    )
);

CREATE INDEX IF NOT EXISTS emr_v2_clinical_assets_clinica_patient_idx
    ON emr_v2_clinical_assets (clinica_id, patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS emr_v2_clinical_assets_sha256_idx
    ON emr_v2_clinical_assets (clinica_id, sha256_hash);

CREATE INDEX IF NOT EXISTS emr_v2_clinical_assets_storage_key_idx
    ON emr_v2_clinical_assets (storage_driver, storage_key);

COMMENT ON TABLE emr_v2_clinical_assets IS
    'EMR v2 binary metadata only. Bytes live in S3 or disk; never base64 in PostgreSQL.';
