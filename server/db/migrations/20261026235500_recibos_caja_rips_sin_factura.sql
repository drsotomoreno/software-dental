-- Recibo de caja como documento agrupador del RIPS sin FEV (Res. 2275).
-- Un recibo tiene muchas atenciones (pago_id). El CUV del MUV queda en el recibo.
-- Idempotente: se puede reejecutar sobre AWS RDS.

ALTER TABLE recibos_caja
    ADD COLUMN IF NOT EXISTS fecha_expedicion TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS cod_prestador VARCHAR(12),
    ADD COLUMN IF NOT EXISTS estado VARCHAR(30) DEFAULT 'EMITIDO',
    ADD COLUMN IF NOT EXISTS cuv TEXT,
    ADD COLUMN IF NOT EXISTS rips_json JSONB,
    ADD COLUMN IF NOT EXISTS rips_fecha_transmision TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN recibos_caja.fecha_expedicion IS
    'Fecha del recibo. Tope de las fechas de atención del JSON; no reemplaza fechaInicioAtencion.';
COMMENT ON COLUMN recibos_caja.cuv IS
    'CUV devuelto por el MUV al radicar el RIPS sin factura de este recibo.';
COMMENT ON COLUMN recibos_caja.rips_json IS
    'JSON RIPS único del recibo. numFactura va null; el número del recibo es el identificador del paquete.';

-- Si se suelta el recibo, un cobro agrupado vuelve a pendiente igual que un PAGADO.
CREATE OR REPLACE FUNCTION sync_estado_rips_sin_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.pago_id IS NULL
       AND OLD.pago_id IS NOT NULL
       AND NEW.estado_rips IN ('PAGADO', 'COBRADO_PROCESADO') THEN
        NEW.estado_rips := 'PENDIENTE_PAGO';
    END IF;
    RETURN NEW;
END;
$$;
