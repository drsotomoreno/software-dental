-- Metadata RIPS (Res. 2275) de la nota de evolución.
-- La tabla atenciones es el sidecar operativo de la nota: no guarda el cuerpo
-- clínico firmado (Res. 1995/1999). Estas columnas se actualizan al vincular un
-- recibo, una FEV o al reintentar el MUV, sin reescribir la firma.
--
-- Mapeo al objeto ripsMetadata:
--   cod_diagnostico_principal  -> codDiagnosticoPrincipal
--   tipo_vinculacion_financiera -> tipoVinculacionFinanciera
--   id_recibo_asociado         -> idReciboAsociado
--   id_factura_electronica     -> idFacturaElectronica
--   causa_motivo_atencion      -> causaMotivoAtencion      (default 38, enfermedad general)
--   finalidad_tecnologia       -> finalidadTecnologia      (default 11, terapéutico)
--   concepto_recaudo           -> conceptoRecaudo          (default 05, no aplica)
--   rips_estado                -> ripsEstado               (transmisión MUV, no el cobro)
--   cuv                        -> cuv
--   rips_fecha_transmision     -> ripsFechaTransmision
--   rips_error_log             -> ripsErrorLog
--
-- estado_rips sigue siendo el estado de cobro (PENDIENTE_PAGO, PAGADO, ...).
-- rips_estado es la transmisión al MUV (sin_preparar, preparado, enviado_ok, error).
-- Idempotente: se puede reejecutar sobre AWS RDS.

ALTER TABLE atenciones
    ADD COLUMN IF NOT EXISTS cod_diagnostico_principal VARCHAR(7),
    ADD COLUMN IF NOT EXISTS tipo_vinculacion_financiera VARCHAR(20) NOT NULL DEFAULT 'valor_cero',
    ADD COLUMN IF NOT EXISTS id_recibo_asociado TEXT,
    ADD COLUMN IF NOT EXISTS id_factura_electronica TEXT,
    ADD COLUMN IF NOT EXISTS causa_motivo_atencion VARCHAR(2) NOT NULL DEFAULT '38',
    ADD COLUMN IF NOT EXISTS finalidad_tecnologia VARCHAR(2) NOT NULL DEFAULT '11',
    ADD COLUMN IF NOT EXISTS concepto_recaudo VARCHAR(2) NOT NULL DEFAULT '05',
    ADD COLUMN IF NOT EXISTS rips_estado VARCHAR(20) NOT NULL DEFAULT 'sin_preparar',
    ADD COLUMN IF NOT EXISTS cuv TEXT,
    ADD COLUMN IF NOT EXISTS rips_fecha_transmision TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS rips_error_log TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_atenciones_tipo_vinculacion_financiera'
    ) THEN
        ALTER TABLE atenciones
            ADD CONSTRAINT ck_atenciones_tipo_vinculacion_financiera
            CHECK (tipo_vinculacion_financiera IN ('recibo_interno', 'fev', 'valor_cero'));
    END IF;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ck_atenciones_rips_estado'
    ) THEN
        ALTER TABLE atenciones
            ADD CONSTRAINT ck_atenciones_rips_estado
            CHECK (rips_estado IN ('sin_preparar', 'preparado', 'enviado_ok', 'error'));
    END IF;
END
$$;

COMMENT ON COLUMN atenciones.cod_diagnostico_principal IS
    'CIE-10 de radicación RIPS. No sustituye el diagnóstico clínico firmado.';
COMMENT ON COLUMN atenciones.tipo_vinculacion_financiera IS
    'recibo_interno | fev | valor_cero. Cómo se soporta el recaudo ante el MUV.';
COMMENT ON COLUMN atenciones.id_recibo_asociado IS
    'Referencia al recibo de caja interno. Mutable después de la firma.';
COMMENT ON COLUMN atenciones.id_factura_electronica IS
    'Referencia a la FEV DIAN. Mutable después de la firma.';
COMMENT ON COLUMN atenciones.causa_motivo_atencion IS
    'Catálogo RIPS causaMotivoAtencion. Default 38, enfermedad general.';
COMMENT ON COLUMN atenciones.finalidad_tecnologia IS
    'Catálogo RIPS finalidadTecnologiaSalud. Default 11, terapéutico.';
COMMENT ON COLUMN atenciones.concepto_recaudo IS
    'Catálogo RIPS conceptoRecaudo. Default 05, no aplica (particular o valor 0).';
COMMENT ON COLUMN atenciones.rips_estado IS
    'Transmisión RIPS: sin_preparar, preparado, enviado_ok, error. Distinto de estado_rips (cobro).';
COMMENT ON COLUMN atenciones.cuv IS
    'Código Único de Validación devuelto por el MUV.';
COMMENT ON COLUMN atenciones.rips_fecha_transmision IS
    'Fecha ISO en que el MUV aceptó el RIPS.';
COMMENT ON COLUMN atenciones.rips_error_log IS
    'Detalle del rechazo o del fallo de transmisión para reintentar.';

CREATE INDEX IF NOT EXISTS idx_atenciones_rips_estado ON atenciones (rips_estado);
CREATE INDEX IF NOT EXISTS idx_atenciones_cuv ON atenciones (cuv);
CREATE INDEX IF NOT EXISTS idx_atenciones_id_recibo_asociado ON atenciones (id_recibo_asociado);
CREATE INDEX IF NOT EXISTS idx_atenciones_id_factura_electronica ON atenciones (id_factura_electronica);
