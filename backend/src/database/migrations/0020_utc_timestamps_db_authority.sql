-- Contrato temporal:
--   * instantes são armazenados como TIMESTAMPTZ;
--   * timestamps legados sem fuso representam UTC;
--   * PostgreSQL é autoridade exclusiva de updated_at.

SET LOCAL TIME ZONE 'UTC';

DO $$
DECLARE
  column_record record;
BEGIN
  FOR column_record IN
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type = 'timestamp without time zone'
    ORDER BY table_name, ordinal_position
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE %L',
      column_record.table_schema,
      column_record.table_name,
      column_record.column_name,
      column_record.column_name,
      'UTC'
    );
  END LOOP;
END
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = clock_timestamp();
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  table_record record;
  trigger_record record;
BEGIN
  FOR table_record IN
    SELECT c.table_schema, c.table_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.column_name = 'updated_at'
      AND c.data_type = 'timestamp with time zone'
    ORDER BY c.table_name
  LOOP
    FOR trigger_record IN
      SELECT t.tgname
      FROM pg_trigger t
      JOIN pg_class rel ON rel.oid = t.tgrelid
      JOIN pg_namespace ns ON ns.oid = rel.relnamespace
      JOIN pg_proc proc ON proc.oid = t.tgfoid
      WHERE ns.nspname = table_record.table_schema
        AND rel.relname = table_record.table_name
        AND proc.proname = 'set_updated_at'
        AND NOT t.tgisinternal
    LOOP
      EXECUTE format(
        'DROP TRIGGER %I ON %I.%I',
        trigger_record.tgname,
        table_record.table_schema,
        table_record.table_name
      );
    END LOOP;

    EXECUTE format(
      'CREATE TRIGGER trg_set_updated_at BEFORE INSERT OR UPDATE ON %I.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      table_record.table_schema,
      table_record.table_name
    );
  END LOOP;
END
$$;
