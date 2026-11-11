-- Fase 4.1 — Limpieza de tablas fantasma (offline-first / CQRS).
-- Fuente de verdad clínica: app_json_store.key = 'clinical-sync'.
-- Read model oficial: idx_pacientes, idx_evoluciones, idx_diagnosticos, idx_procedimientos.
-- Espejo demográfico activo: pacientes (clinicPatientMirror).
-- Idempotente: se puede reejecutar sobre AWS RDS.

-- historias_clinicas: schema sin INSERT/UPDATE en runtime; absorbida por clinical-sync + idx_*.
DROP TABLE IF EXISTS historias_clinicas CASCADE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'pacientes'
  ) THEN
    EXECUTE $c$
      COMMENT ON TABLE pacientes IS
        'Espejo demográfico por tenant (clinicPatientMirror). El cuerpo clínico firmado vive en app_json_store (clinical-sync); analítica en idx_*.'
    $c$;
  END IF;
END $$;
