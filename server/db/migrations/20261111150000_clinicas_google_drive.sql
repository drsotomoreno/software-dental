-- Google Drive OAuth por clínica (tenant).
-- Tokens cifrados en aplicación (AES-256-GCM); aquí solo se persiste el ciphertext.
-- clinic_canonical_id = resolveClinicSyncId → "clinic:{tenantId}".

-- 1) Columnas en clinicas (cuando el tenant ya tiene fila UUID)
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS google_drive_email VARCHAR(255);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS google_drive_refresh_token TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS google_drive_root_folder_id VARCHAR(128);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS google_drive_connected_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS google_drive_status VARCHAR(32) NOT NULL DEFAULT 'disconnected';
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS clinic_canonical_id VARCHAR(255);

CREATE UNIQUE INDEX IF NOT EXISTS idx_clinicas_clinic_canonical_id
  ON clinicas (clinic_canonical_id)
  WHERE clinic_canonical_id IS NOT NULL AND btrim(clinic_canonical_id) <> '';

COMMENT ON COLUMN clinicas.google_drive_refresh_token IS
  'Refresh token de Google OAuth cifrado (AES-GCM). Nunca plaintext.';
COMMENT ON COLUMN clinicas.google_drive_root_folder_id IS
  'ID de la carpeta visible mihistoriadental - [Nombre] en Drive del dueño.';
COMMENT ON COLUMN clinicas.clinic_canonical_id IS
  'Clave canónica de sync: clinic:{tenantId}. Alinea Postgres con clinicalSyncStore.';

-- 2) Tabla operativa indexada por clinicId canónico (fuente de verdad OAuth)
CREATE TABLE IF NOT EXISTS clinica_google_drive (
  clinic_canonical_id TEXT PRIMARY KEY,
  google_drive_email VARCHAR(255),
  google_drive_refresh_token TEXT,
  google_drive_root_folder_id VARCHAR(128),
  google_drive_access_token TEXT,
  google_drive_token_expires_at TIMESTAMP WITH TIME ZONE,
  google_drive_connected_at TIMESTAMP WITH TIME ZONE,
  google_drive_status VARCHAR(32) NOT NULL DEFAULT 'disconnected',
  clinic_name VARCHAR(255),
  connected_by_user_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clinica_google_drive_email
  ON clinica_google_drive (google_drive_email)
  WHERE google_drive_email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinica_google_drive_status
  ON clinica_google_drive (google_drive_status);

COMMENT ON TABLE clinica_google_drive IS
  'OAuth Google Drive por tenant canónico. refresh_token siempre cifrado en reposo.';
COMMENT ON COLUMN clinica_google_drive.google_drive_refresh_token IS
  'Ciphertext v1:iv:tag:payload (ver server/utils/tokenEncryption.js).';
