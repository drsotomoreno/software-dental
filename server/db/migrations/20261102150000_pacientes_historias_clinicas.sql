-- Pacientes multi-tenant (clinica_id estricto) — espejo demográfico.
-- Offline-first: updated_at + deleted_at (soft delete).
-- Idempotente para AWS RDS. No reemplaza las tablas legacy `patients` / `consultas`.
-- Depende de: clinicas, usuarios (20261102143000_clinicas_usuarios_rbac.sql).
-- Nota: historias_clinicas se eliminó en 20261111170000_cleanup_ghost_tables.sql
-- (fuente de verdad = app_json_store clinical-sync; read model = idx_*).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Pacientes (aislados por clinica_id; documento único por sede)
CREATE TABLE IF NOT EXISTS pacientes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    tipo_documento VARCHAR(5) NOT NULL,
    numero_documento VARCHAR(50) NOT NULL,
    nombres VARCHAR(100) NOT NULL,
    apellidos VARCHAR(100) NOT NULL,
    fecha_nacimiento DATE NOT NULL,
    sexo VARCHAR(2) NOT NULL,
    email VARCHAR(255),
    telefono VARCHAR(50),
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS clinica_id UUID;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS tipo_documento VARCHAR(5);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS numero_documento VARCHAR(50);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS nombres VARCHAR(100);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS apellidos VARCHAR(100);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS fecha_nacimiento DATE;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS sexo VARCHAR(2);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS telefono VARCHAR(50);
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE pacientes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_clinica_id_fkey'
  ) THEN
    ALTER TABLE pacientes
      ADD CONSTRAINT pacientes_clinica_id_fkey
      FOREIGN KEY (clinica_id) REFERENCES clinicas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_sexo_chk'
  ) THEN
    ALTER TABLE pacientes
      ADD CONSTRAINT pacientes_sexo_chk
      CHECK (sexo IN ('F', 'M', 'O'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pacientes_tipo_documento_chk'
  ) THEN
    ALTER TABLE pacientes
      ADD CONSTRAINT pacientes_tipo_documento_chk
      CHECK (upper(tipo_documento) IN (
        'CC', 'TI', 'CE', 'PA', 'RC', 'NV', 'CD', 'SC', 'PE', 'PT', 'AS', 'MS'
      ));
  END IF;
END $$;

-- Documento único por sede; permite reutilizar documento tras soft-delete.
CREATE UNIQUE INDEX IF NOT EXISTS idx_paciente_documento_clinica
    ON pacientes (clinica_id, tipo_documento, numero_documento)
    WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_pacientes_clinica ON pacientes (clinica_id);
CREATE INDEX IF NOT EXISTS idx_pacientes_sync
    ON pacientes (clinica_id, updated_at)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_pacientes_deleted_sync
    ON pacientes (clinica_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE pacientes IS
    'Pacientes por tenant. clinica_id obligatorio. Soft-delete via deleted_at para sync offline.';
COMMENT ON COLUMN pacientes.tipo_documento IS
    'Tipo de documento RIPS/DIAN (CC, TI, CE, PA, …).';
COMMENT ON COLUMN pacientes.deleted_at IS
    'Soft delete: las tablets offline aplican el borrado al reconectarse.';

-- historias_clinicas fue tabla fantasma (sin writers). Eliminada en
-- 20261111170000_cleanup_ghost_tables.sql. Cuerpo clínico: app_json_store
-- (clinical-sync). Analítica: idx_*. No recrear aquí.
