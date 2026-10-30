-- Res. 1995/1999: las notas de evolución son de autoría exclusiva del profesional.
-- Elimina patientSignatureDataUrl / patientSignatureMeta legados dentro del
-- JSON clínico almacenado en app_json_store (clave clinical-sync).
-- No existen columnas SQL dedicadas a la firma del paciente en evoluciones:
-- el campo vivía embebido en el payload JSONB.

CREATE OR REPLACE FUNCTION strip_evolution_patient_signatures_from_notes(notes jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  result jsonb := '[]'::jsonb;
  elem jsonb;
  cleaned jsonb;
BEGIN
  IF notes IS NULL OR jsonb_typeof(notes) <> 'array' THEN
    RETURN notes;
  END IF;

  FOR elem IN SELECT value FROM jsonb_array_elements(notes)
  LOOP
    cleaned := elem - 'patientSignatureDataUrl' - 'patientSignatureMeta';
    result := result || jsonb_build_array(cleaned);
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION strip_evolution_patient_signatures_from_payload(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  next_payload jsonb := payload;
  draft jsonb;
BEGIN
  IF payload IS NULL OR jsonb_typeof(payload) <> 'object' THEN
    RETURN payload;
  END IF;

  IF payload ? 'evolutionNotes' AND jsonb_typeof(payload->'evolutionNotes') = 'array' THEN
    next_payload := jsonb_set(
      next_payload,
      '{evolutionNotes}',
      strip_evolution_patient_signatures_from_notes(payload->'evolutionNotes'),
      true
    );
  END IF;

  IF payload ? 'clinicalDraft'
     AND jsonb_typeof(payload->'clinicalDraft') = 'object'
     AND (payload->'clinicalDraft') ? 'evolutionNotes'
     AND jsonb_typeof(payload->'clinicalDraft'->'evolutionNotes') = 'array'
  THEN
    draft := jsonb_set(
      payload->'clinicalDraft',
      '{evolutionNotes}',
      strip_evolution_patient_signatures_from_notes(payload->'clinicalDraft'->'evolutionNotes'),
      true
    );
    next_payload := jsonb_set(next_payload, '{clinicalDraft}', draft, true);
  END IF;

  IF payload ? 'valuationDraft'
     AND jsonb_typeof(payload->'valuationDraft') = 'object'
     AND (payload->'valuationDraft') ? 'evolutionNotes'
     AND jsonb_typeof(payload->'valuationDraft'->'evolutionNotes') = 'array'
  THEN
    draft := jsonb_set(
      payload->'valuationDraft',
      '{evolutionNotes}',
      strip_evolution_patient_signatures_from_notes(payload->'valuationDraft'->'evolutionNotes'),
      true
    );
    next_payload := jsonb_set(next_payload, '{valuationDraft}', draft, true);
  END IF;

  RETURN next_payload;
END;
$$;

-- Recorre clinics → clinicalRecords / drafts → payload y limpia firmas de paciente.
DO $$
DECLARE
  store jsonb;
  clinic_id text;
  clinic jsonb;
  entity_key text;
  sync_id text;
  record jsonb;
  payload jsonb;
  cleaned jsonb;
  updated boolean := false;
BEGIN
  SELECT value INTO store FROM app_json_store WHERE key = 'clinical-sync';
  IF store IS NULL OR jsonb_typeof(store) <> 'object' THEN
    RETURN;
  END IF;
  IF NOT (store ? 'clinics') OR jsonb_typeof(store->'clinics') <> 'object' THEN
    RETURN;
  END IF;

  FOR clinic_id, clinic IN SELECT key, value FROM jsonb_each(store->'clinics')
  LOOP
    IF jsonb_typeof(clinic) <> 'object' THEN
      CONTINUE;
    END IF;

    FOREACH entity_key IN ARRAY ARRAY['clinicalRecords', 'drafts']
    LOOP
      IF NOT (clinic ? entity_key) OR jsonb_typeof(clinic->entity_key) <> 'object' THEN
        CONTINUE;
      END IF;

      FOR sync_id, record IN SELECT key, value FROM jsonb_each(clinic->entity_key)
      LOOP
        IF jsonb_typeof(record) <> 'object' OR NOT (record ? 'payload') THEN
          CONTINUE;
        END IF;
        payload := record->'payload';
        cleaned := strip_evolution_patient_signatures_from_payload(payload);
        IF cleaned IS DISTINCT FROM payload THEN
          store := jsonb_set(
            store,
            ARRAY['clinics', clinic_id, entity_key, sync_id, 'payload'],
            cleaned,
            true
          );
          updated := true;
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  IF updated THEN
    INSERT INTO app_json_store (key, value, updated_at)
    VALUES ('clinical-sync', store, now())
    ON CONFLICT (key) DO UPDATE
      SET value = EXCLUDED.value,
          updated_at = EXCLUDED.updated_at;
  END IF;
END;
$$;

COMMENT ON FUNCTION strip_evolution_patient_signatures_from_notes(jsonb) IS
  'Res. 1995/1999: quita firmas de paciente de notas de evolución embebidas en JSON.';
