-- Anticipo: el recaudo puede ser anterior a las evoluciones firmadas.
-- fecha_expedicion sigue siendo el día en que entró el dinero.
-- fecha_corte_rips es la cabecera del RIPS (última evolución o día de transmisión).
-- Idempotente: se puede reejecutar sobre AWS RDS.

ALTER TABLE recibos_caja
    ADD COLUMN IF NOT EXISTS fecha_corte_rips TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN recibos_caja.fecha_expedicion IS
    'Fecha de recaudo financiero: cuándo entró el dinero. No es la cabecera del RIPS si hay atenciones posteriores.';
COMMENT ON COLUMN recibos_caja.fecha_corte_rips IS
    'Fecha de corte del RIPS sin factura. La última evolución firmada, o el día de Transmitir si ya la alcanzó. No va dentro del objeto rips enviado al MUV.';
COMMENT ON COLUMN recibos_caja.estado IS
    'EMITIDO, PENDIENTE_TRANSMISION o TRANSMITIDO. El anticipo permanece pendiente hasta que el paquete clínico esté firmado y el MUV devuelva el CUV.';
