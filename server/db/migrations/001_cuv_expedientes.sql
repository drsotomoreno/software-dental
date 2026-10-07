-- Expediente de validación FEV-RIPS / FEVCD y cada intento ante MinSalud.
-- Estados: aprobado (CUV sin observaciones), notificado (CUV con reglas
-- NOTIFICACION que siguen exigiendo revisión), rechazado (sin CUV útil).

CREATE TABLE IF NOT EXISTS schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS cuv_expedientes (
  id text PRIMARY KEY,
  invoice_id text,
  clinical_record_id text,
  patient_id text,
  num_factura text,
  num_documento_id_obligado text,
  cuv text,
  estado text NOT NULL,
  proceso_id text,
  fecha_radicacion text,
  ambiente text,
  modulo text,
  source text,
  tiene_paquete boolean NOT NULL DEFAULT false,
  package_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cuv_expedientes_estado_chk CHECK (estado IN ('aprobado', 'notificado', 'rechazado'))
);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_factura
  ON cuv_expedientes (num_factura);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_cuv
  ON cuv_expedientes (cuv);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_estado
  ON cuv_expedientes (estado);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_invoice
  ON cuv_expedientes (invoice_id);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_atencion
  ON cuv_expedientes (clinical_record_id);

CREATE TABLE IF NOT EXISTS cuv_intentos (
  id text PRIMARY KEY,
  expediente_id text NOT NULL REFERENCES cuv_expedientes (id),
  numero integer NOT NULL,
  estado text NOT NULL,
  http_status integer,
  cuv text,
  notificaciones jsonb NOT NULL DEFAULT '[]'::jsonb,
  rechazos jsonb NOT NULL DEFAULT '[]'::jsonb,
  respuesta_cruda jsonb,
  source text,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  CONSTRAINT cuv_intentos_estado_chk CHECK (estado IN ('aprobado', 'notificado', 'rechazado')),
  CONSTRAINT cuv_intentos_unico UNIQUE (expediente_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_cuv_intentos_expediente
  ON cuv_intentos (expediente_id, numero);
