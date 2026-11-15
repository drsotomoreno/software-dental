-- Colaboradores del titular (mihistoriadental).
-- Idempotente. No hace DROP ni altera migraciones anteriores.
--
-- Estado real de la tabla (20261102143000_clinicas_usuarios_rbac.sql
-- y 20261108190000_usuarios_whatsapp.sql):
--   usuarios.id            UUID PK
--   usuarios.clinica_id    UUID → clinicas(id)
--   usuarios.email         VARCHAR(255) UNIQUE NOT NULL
--   usuarios.password_hash VARCHAR(255) NOT NULL
--   usuarios.nombre_completo VARCHAR(255) NOT NULL
--   usuarios.registro_rethus VARCHAR(50)   -- ReTHUS ya persistido; no se renombra
--   usuarios.is_superadmin BOOLEAN NOT NULL DEFAULT FALSE
--   usuarios.rol           VARCHAR(50) NOT NULL DEFAULT 'odontologo'
--                          valores vigentes: superadmin, admin, admin_clinica,
--                          odontologo, recepcion, asistente
--   usuarios.estado        VARCHAR(20) NOT NULL DEFAULT 'activo'
--   usuarios.phone_number / whatsapp_verified / whatsapp_status
--   usuarios.created_at
--   clinicas.codigo_reps   VARCHAR(50)  -- REPS de la sede; no es columna de usuarios
--
-- usuarios.rol YA existe. ADD COLUMN IF NOT EXISTS no cambia su tipo,
-- su default 'odontologo' ni las filas actuales. No se reescribe rol = 'TITULAR'
-- en cuentas existentes: eso pisaría el RBAC vigente y el upsert de la cuenta
-- maestra (ensureMasterUsuarioRow escribe rol = 'superadmin').
-- Los roles nuevos conviven en la misma columna. El CHECK de abajo acepta
-- el vocabulario nuevo y el que ya usa la aplicación.

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol VARCHAR(50);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS titular_id UUID;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_sede_reps VARCHAR(20);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rethus VARCHAR(50);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS invite_token VARCHAR(100);

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMP;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS activo BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_titular_id_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_titular_id_fkey
      FOREIGN KEY (titular_id) REFERENCES usuarios(id) ON DELETE RESTRICT;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_titular_id_not_self_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_titular_id_not_self_chk
      CHECK (titular_id IS NULL OR titular_id <> id);
  END IF;
END $$;

-- Vocabulario nuevo + roles que ya persiste el RBAC. Sin esto, un CHECK
-- limitado a TITULAR / COLABORADOR_* rechazaría la cuenta maestra y el equipo actual.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_rol_colaborador_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rol_colaborador_chk
      CHECK (
        rol IN (
          'TITULAR',
          'COLABORADOR_CLINICO',
          'COLABORADOR_ADMIN',
          'superadmin',
          'admin',
          'admin_clinica',
          'odontologo',
          'recepcion',
          'asistente'
        )
      );
  END IF;
END $$;

-- TITULAR: sin titular_id, con código de sede REPS y ReTHUS.
-- COLABORADOR_CLINICO: cuelga del titular y exige ReTHUS.
-- COLABORADOR_ADMIN: cuelga del titular y ReTHUS queda NULL.
-- Los roles históricos no entran en estas reglas.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_colaborador_titular_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_colaborador_titular_chk
      CHECK (
        rol NOT IN ('TITULAR', 'COLABORADOR_CLINICO', 'COLABORADOR_ADMIN')
        OR (rol = 'TITULAR' AND titular_id IS NULL)
        OR (
          rol IN ('COLABORADOR_CLINICO', 'COLABORADOR_ADMIN')
          AND titular_id IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_codigo_sede_reps_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_codigo_sede_reps_chk
      CHECK (
        rol IS DISTINCT FROM 'TITULAR'
        OR (
          codigo_sede_reps IS NOT NULL
          AND btrim(codigo_sede_reps) <> ''
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'usuarios_rethus_por_rol_chk'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_rethus_por_rol_chk
      CHECK (
        (
          rol IN ('TITULAR', 'COLABORADOR_CLINICO')
          AND rethus IS NOT NULL
          AND btrim(rethus) <> ''
        )
        OR (
          rol = 'COLABORADOR_ADMIN'
          AND rethus IS NULL
        )
        OR rol NOT IN ('TITULAR', 'COLABORADOR_CLINICO', 'COLABORADOR_ADMIN')
      );
  END IF;
END $$;

-- Unicidad del token de invitación. Varios NULL conviven (aún no invitados).
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_invite_token
  ON usuarios (invite_token);

CREATE INDEX IF NOT EXISTS idx_usuarios_titular_id
  ON usuarios (titular_id)
  WHERE titular_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usuarios_activo
  ON usuarios (activo);

-- Copia inicial, sin pisar un valor ya cargado en las columnas nuevas.
-- codigo_reps de la sede puede medir hasta 50; solo se copia si cabe en VARCHAR(20).
UPDATE usuarios AS u
SET codigo_sede_reps = btrim(c.codigo_reps)
FROM clinicas AS c
WHERE u.clinica_id = c.id
  AND u.codigo_sede_reps IS NULL
  AND c.codigo_reps IS NOT NULL
  AND char_length(btrim(c.codigo_reps)) BETWEEN 1 AND 20;

UPDATE usuarios
SET rethus = btrim(registro_rethus)
WHERE rethus IS NULL
  AND registro_rethus IS NOT NULL
  AND btrim(registro_rethus) <> '';

COMMENT ON COLUMN usuarios.titular_id IS
  'Usuario titular de la clínica. NULL en el titular y en cuentas históricas. Obligatorio en COLABORADOR_CLINICO y COLABORADOR_ADMIN.';
COMMENT ON COLUMN usuarios.codigo_sede_reps IS
  'Código REPS de la sede del titular (VARCHAR 20). Obligatorio cuando rol = TITULAR. La sede también guarda clinicas.codigo_reps (VARCHAR 50).';
COMMENT ON COLUMN usuarios.rethus IS
  'ReTHUS del profesional. Obligatorio en TITULAR y COLABORADOR_CLINICO. NULL en COLABORADOR_ADMIN. registro_rethus se conserva.';
COMMENT ON COLUMN usuarios.invite_token IS
  'Token único de invitación del colaborador. NULL si la cuenta no está invitada.';
COMMENT ON COLUMN usuarios.invite_expires_at IS
  'Vencimiento del invite_token.';
COMMENT ON COLUMN usuarios.activo IS
  'Acceso habilitado del colaborador. Distinto de usuarios.estado (activo/inactivo de suscripción).';
