-- Consecutivos de cobro aislados por titular.
-- usuario_titular_id es el clinicId (texto). No hay tabla usuarios UUID.

CREATE TABLE IF NOT EXISTS consecutivos_prestador (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_titular_id text NOT NULL,
  tipo_documento varchar(50) NOT NULL,
  prefijo varchar(10) NOT NULL DEFAULT 'RC-',
  ultimo_consecutivo integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_usuario_tipo_doc UNIQUE (usuario_titular_id, tipo_documento),
  CONSTRAINT ck_consecutivo_tipo_documento CHECK (tipo_documento IN ('RECIBO_CAJA', 'CUENTA_COBRO'))
);

CREATE TABLE IF NOT EXISTS recibos_caja (
  id text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  usuario_titular_id text NOT NULL,
  tipo_documento varchar(50) NOT NULL DEFAULT 'RECIBO_CAJA',
  consecutivo integer NOT NULL,
  numero_documento varchar(32) NOT NULL,
  prefijo varchar(10) NOT NULL DEFAULT 'RC-',
  monto numeric(14, 2) NOT NULL DEFAULT 0,
  patient_id text,
  payment_id text,
  clinical_record_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_recibo_titular_consecutivo UNIQUE (usuario_titular_id, tipo_documento, consecutivo),
  CONSTRAINT ck_recibo_tipo_documento CHECK (tipo_documento IN ('RECIBO_CAJA', 'CUENTA_COBRO'))
);

CREATE INDEX IF NOT EXISTS idx_recibos_caja_titular ON recibos_caja (usuario_titular_id, numero_documento);
