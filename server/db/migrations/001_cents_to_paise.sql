-- Legacy columns already contain paise values written by the client parser.
-- Rename only; do not multiply or divide the stored amounts.
BEGIN;
DO $$
DECLARE item RECORD;
DECLARE has_old BOOLEAN;
DECLARE has_new BOOLEAN;
BEGIN
  FOR item IN SELECT * FROM (VALUES
    ('products', 'price_cents', 'price_paise'),
    ('orders', 'amount_cents', 'amount_paise'),
    ('payments', 'amount_cents', 'amount_paise'),
    ('ledger_entries', 'amount_cents', 'amount_paise')
  ) AS renames(table_name, old_name, new_name)
  LOOP
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = item.table_name AND column_name = item.old_name) INTO has_old;
    SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = item.table_name AND column_name = item.new_name) INTO has_new;
    IF has_old AND has_new THEN
      RAISE EXCEPTION 'Both legacy column % and target column % exist on table %; inspect before migrating', item.old_name, item.new_name, item.table_name;
    ELSIF has_old THEN
      EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', item.table_name, item.old_name, item.new_name);
    ELSIF NOT has_new THEN
      RAISE EXCEPTION 'Neither % nor % exists on table %', item.old_name, item.new_name, item.table_name;
    END IF;
  END LOOP;
END $$;
COMMIT;
