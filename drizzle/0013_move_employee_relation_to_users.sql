ALTER TABLE "users"
ADD COLUMN IF NOT EXISTS "employee_id" text;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'user_id'
  ) THEN
    UPDATE "users" AS u
    SET "employee_id" = e."id"
    FROM "employees" AS e
    WHERE e."user_id" = u."id"
      AND u."employee_id" IS NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_employee_id_fkey'
  ) THEN
    ALTER TABLE "users"
    ADD CONSTRAINT "users_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id");
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "users_employee_id_unique" ON "users" ("employee_id");

DROP INDEX IF EXISTS "employees_user_id_unique";

ALTER TABLE "employees"
DROP COLUMN IF EXISTS "user_id";
