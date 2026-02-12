DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'position'
  ) THEN
    ALTER TABLE "employees" RENAME COLUMN "position" TO "title";
  END IF;
END $$;

