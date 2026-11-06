-- Multi-tenant RBAC: clínicas (tenants) + usuarios con llave maestra is_superadmin.
-- Idempotente para AWS RDS / Postgres local.
-- La tabla legacy `clinics` (topes corporativos) se mantiene aparte.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. Clínicas (tenants / sedes)
CREATE TABLE IF NOT EXISTS clinicas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre VARCHAR(255) NOT NULL,
    codigo_reps VARCHAR(50),
    direccion TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS nombre VARCHAR(255);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS codigo_reps VARCHAR(50);
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS direccion TEXT;
ALTER TABLE clinicas ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- REPS único cuando hay código; NULL no choca entre sedes sin REPS.
CREATE UNIQUE INDEX IF NOT EXISTS idx_clinicas_codigo_reps_unique
    ON clinicas (codigo_reps)
    WHERE codigo_reps IS NOT NULL AND btrim(codigo_reps) <> '';

CREATE INDEX IF NOT EXISTS idx_clinicas_nombre ON clinicas (nombre);

COMMENT ON TABLE clinicas IS
    'Tenants / sedes odontológicas. El Superadmin no pertenece a una sola clínica.';
COMMENT ON COLUMN clinicas.codigo_reps IS
    'Código REPS del prestador; clave para validación RIPS / MinSalud.';

-- 2. Usuarios (odontólogos, asistentes, admin de clínica, superadmin)
CREATE TABLE IF NOT EXISTS usuarios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    clinica_id UUID REFERENCES clinicas(id) ON DELETE SET NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    nombre_completo VARCHAR(255) NOT NULL,
    registro_rethus VARCHAR(50),
    is_superadmin BOOLEAN NOT NULL DEFAULT FALSE,
    rol VARCHAR(50) NOT NULL DEFAULT 'odontologo',
    estado VARCHAR(20) NOT NULL DEFAULT 'activo',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS clinica_id UUID;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre_completo VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS registro_rethus VARCHAR(50);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(50) DEFAULT 'odontologo';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS estado VARCHAR(20) DEFAULT 'activo';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_clinica_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_clinica_id_fkey
      FOREIGN KEY (clinica_id) REFERENCES clinicas(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Solo la cuenta maestra puede marcarse como Superadmin (God Mode).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_superadmin_email_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_superadmin_email_chk
      CHECK (
        is_superadmin = FALSE
        OR lower(email) = 'doctormauriciosoto@gmail.com'
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_email_key'
  ) THEN
    ALTER TABLE usuarios ADD CONSTRAINT usuarios_email_key UNIQUE (email);
  END IF;
END $$;

-- Una sola fila con is_superadmin = TRUE en toda la plataforma.
CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_single_superadmin
    ON usuarios (is_superadmin)
    WHERE is_superadmin = TRUE;

CREATE INDEX IF NOT EXISTS idx_usuarios_clinica ON usuarios (clinica_id);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios (email);
CREATE INDEX IF NOT EXISTS idx_usuarios_rethus ON usuarios (registro_rethus)
    WHERE registro_rethus IS NOT NULL AND btrim(registro_rethus) <> '';

COMMENT ON TABLE usuarios IS
    'Cuentas de acceso. is_superadmin es la llave maestra; clinica_id NULL = flota sobre todos los tenants.';
COMMENT ON COLUMN usuarios.is_superadmin IS
    'God Mode. Solo doctormauriciosoto@gmail.com. Omite aislamiento multi-tenant.';
COMMENT ON COLUMN usuarios.clinica_id IS
    'Tenant del usuario. NULL para el Superadministrador.';
COMMENT ON COLUMN usuarios.registro_rethus IS
    'ReTHUS del profesional; requerido para firmar evoluciones.';

-- 3. Semilla de la cuenta maestra (password_hash se completa desde Node con el hash real).
-- No insertar hash placeholder aquí: el servicio tenantRbacStore hace el UPSERT seguro.
