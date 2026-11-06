-- Pacientes e historias clínicas multi-tenant (clínica_id estricto).
-- Offline-first: updated_at + deleted_at (soft delete) para sync Dexie ↔ Postgres.
-- Idempotente para AWS RDS. No reemplaza las tablas legacy `patients` / `consultas`.
-- Depende de: clinicas, usuarios (20261102143000_clinicas_usuarios_rbac.sql).

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

-- 2. Historias clínicas (evoluciones / consultas) — autoría profesional
-- Normativa: la evolución NO lleva firma del paciente; solo firma del odontólogo (ReTHUS + timestamp).
CREATE TABLE IF NOT EXISTS historias_clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID NOT NULL REFERENCES clinicas(id) ON DELETE CASCADE,
    paciente_id UUID NOT NULL REFERENCES pacientes(id) ON DELETE CASCADE,
    odontologo_id UUID REFERENCES usuarios(id) ON DELETE SET NULL,

    fecha_consulta TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    motivo_consulta TEXT NOT NULL,
    notas_clinicas TEXT,

    diagnostico_principal VARCHAR(10) NOT NULL,
    finalidad_consulta VARCHAR(2) NOT NULL,
    causa_externa VARCHAR(2) NOT NULL,
    tipo_usuario VARCHAR(2) NOT NULL,

    estado VARCHAR(20) NOT NULL DEFAULT 'borrador',
    firma_digital_url TEXT,
    firma_rethus VARCHAR(50),
    firmado_en TIMESTAMP WITH TIME ZONE,

    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS clinica_id UUID;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS paciente_id UUID;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS odontologo_id UUID;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS fecha_consulta TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS motivo_consulta TEXT;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS notas_clinicas TEXT;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS diagnostico_principal VARCHAR(10);
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS finalidad_consulta VARCHAR(2);
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS causa_externa VARCHAR(2);
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS tipo_usuario VARCHAR(2);
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'borrador';
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS firma_digital_url TEXT;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS firma_rethus VARCHAR(50);
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS firmado_en TIMESTAMP WITH TIME ZONE;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE historias_clinicas ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historias_clinicas_clinica_id_fkey'
  ) THEN
    ALTER TABLE historias_clinicas
      ADD CONSTRAINT historias_clinicas_clinica_id_fkey
      FOREIGN KEY (clinica_id) REFERENCES clinicas(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historias_clinicas_paciente_id_fkey'
  ) THEN
    ALTER TABLE historias_clinicas
      ADD CONSTRAINT historias_clinicas_paciente_id_fkey
      FOREIGN KEY (paciente_id) REFERENCES pacientes(id) ON DELETE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historias_clinicas_odontologo_id_fkey'
  ) THEN
    ALTER TABLE historias_clinicas
      ADD CONSTRAINT historias_clinicas_odontologo_id_fkey
      FOREIGN KEY (odontologo_id) REFERENCES usuarios(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historias_clinicas_estado_chk'
  ) THEN
    ALTER TABLE historias_clinicas
      ADD CONSTRAINT historias_clinicas_estado_chk
      CHECK (estado IN ('borrador', 'cerrada_firmada'));
  END IF;
END $$;

-- Firma profesional obligatoria al cerrar (ReTHUS + timestamp). Sin firma de paciente.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'historias_clinicas_firma_cierre_chk'
  ) THEN
    ALTER TABLE historias_clinicas
      ADD CONSTRAINT historias_clinicas_firma_cierre_chk
      CHECK (
        estado <> 'cerrada_firmada'
        OR (
          firma_rethus IS NOT NULL
          AND btrim(firma_rethus) <> ''
          AND firmado_en IS NOT NULL
        )
      );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_historias_paciente ON historias_clinicas (paciente_id);
CREATE INDEX IF NOT EXISTS idx_historias_clinica ON historias_clinicas (clinica_id);
CREATE INDEX IF NOT EXISTS idx_historias_odontologo ON historias_clinicas (odontologo_id);
CREATE INDEX IF NOT EXISTS idx_historias_sync
    ON historias_clinicas (clinica_id, updated_at)
    WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_historias_deleted_sync
    ON historias_clinicas (clinica_id, deleted_at)
    WHERE deleted_at IS NOT NULL;

COMMENT ON TABLE historias_clinicas IS
    'Evoluciones / consultas por tenant. Autoría exclusiva del odontólogo (ReTHUS + timestamp al cerrar).';
COMMENT ON COLUMN historias_clinicas.notas_clinicas IS
    'Texto de evolución; destino del dictado por voz.';
COMMENT ON COLUMN historias_clinicas.diagnostico_principal IS
    'CIE-10 principal para RIPS / MUV (ej. K021).';
COMMENT ON COLUMN historias_clinicas.firma_digital_url IS
    'URL del PDF firmado por el profesional. No es firma del paciente.';
COMMENT ON COLUMN historias_clinicas.firma_rethus IS
    'Registro ReTHUS del odontólogo al cerrar/firmar la evolución.';
COMMENT ON COLUMN historias_clinicas.firmado_en IS
    'Timestamp inmutable del cierre/firma electrónica del profesional.';
