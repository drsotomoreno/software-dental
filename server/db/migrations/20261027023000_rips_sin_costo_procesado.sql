-- Transmisión RIPS sin cobro (control, garantía o cortesía).
-- El agrupador sigue siendo un recibo de caja, con valor 0 y prefijo CTRL-, GAR- o CORT-.
-- estado_rips PROCESADO significa que la evolución quedó enlazada a ese agrupador.
-- Idempotente: se puede reejecutar sobre AWS RDS.

COMMENT ON COLUMN recibos_caja.estado IS
    'EMITIDO, PENDIENTE_TRANSMISION, PROCESADO o TRANSMITIDO. PROCESADO es el agrupador de $0 (CTRL-, GAR-, CORT-) antes o después de radicar el RIPS sin factura.';

COMMENT ON COLUMN recibos_caja.prefijo IS
    'RC- para recaudo. CTRL-, GAR- y CORT- identifican una transmisión no financiera de costo cero.';

COMMENT ON COLUMN atenciones.estado_rips IS
    'PENDIENTE_PAGO, PENDIENTE, SIN_COSTO, PAGADO, COBRADO_PROCESADO o PROCESADO. PROCESADO enlaza la evolución al agrupador de $0.';

-- Soltar el agrupador devuelve la atención a pendiente, también si ya estaba PROCESADO.
CREATE OR REPLACE FUNCTION sync_estado_rips_sin_pago()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.pago_id IS NULL
       AND OLD.pago_id IS NOT NULL
       AND NEW.estado_rips IN ('PAGADO', 'COBRADO_PROCESADO', 'PROCESADO') THEN
        NEW.estado_rips := 'PENDIENTE_PAGO';
    END IF;
    RETURN NEW;
END;
$$;
