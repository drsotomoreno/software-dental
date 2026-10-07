-- Referencia del expediente CUV asociado a la factura y a la atención.
-- La migración que aplica el servidor está en
-- server/db/migrations/001_cuv_expedientes.sql
-- Copia local de consulta: Dexie `cuvExpedientes` (database.ts versión 29).

CREATE TABLE IF NOT EXISTS cuv_expedientes (
  id TEXT PRIMARY KEY,
  invoice_id TEXT,
  clinical_record_id TEXT,
  patient_id TEXT,
  num_factura TEXT,
  num_documento_id_obligado TEXT,
  cuv TEXT,
  estado TEXT NOT NULL CHECK (estado IN ('aprobado', 'notificado', 'rechazado')),
  proceso_id TEXT,
  fecha_radicacion TEXT,
  ambiente TEXT,
  modulo TEXT,
  source TEXT,
  tiene_paquete INTEGER NOT NULL DEFAULT 0,
  package_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_factura ON cuv_expedientes (num_factura);
CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_cuv ON cuv_expedientes (cuv);
CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_estado ON cuv_expedientes (estado);
CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_invoice ON cuv_expedientes (invoice_id);
CREATE INDEX IF NOT EXISTS idx_cuv_expedientes_atencion ON cuv_expedientes (clinical_record_id);

CREATE TABLE IF NOT EXISTS cuv_intentos (
  id TEXT PRIMARY KEY,
  expediente_id TEXT NOT NULL,
  numero INTEGER NOT NULL,
  estado TEXT NOT NULL CHECK (estado IN ('aprobado', 'notificado', 'rechazado')),
  http_status INTEGER,
  cuv TEXT,
  notificaciones TEXT NOT NULL DEFAULT '[]',
  rechazos TEXT NOT NULL DEFAULT '[]',
  respuesta_cruda TEXT,
  source TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  UNIQUE (expediente_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_cuv_intentos_expediente
  ON cuv_intentos (expediente_id, numero);
