ALTER TABLE "attendance_records" ADD COLUMN IF NOT EXISTS "employee_id" text;

UPDATE "attendance_records" AS ar
SET "employee_id" = u."employee_id"
FROM "users" AS u
WHERE ar."user_id" = u."id"
  AND ar."employee_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "attendance_records"
    WHERE "employee_id" IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration gagal: ada attendance tanpa employee. Hubungkan user ke employee terlebih dulu.';
  END IF;
END
$$;

ALTER TABLE "attendance_records"
  ALTER COLUMN "employee_id" SET NOT NULL;

ALTER TABLE "attendance_records"
  ADD CONSTRAINT "attendance_records_employee_id_employees_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

DROP INDEX IF EXISTS "attendance_records_user_date_unique";
DROP INDEX IF EXISTS "attendance_records_user_id_idx";

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_employee_date_unique"
  ON "attendance_records" ("employee_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "attendance_records_employee_id_idx"
  ON "attendance_records" ("employee_id");

ALTER TABLE "attendance_records" DROP CONSTRAINT IF EXISTS "attendance_records_user_id_users_id_fk";
ALTER TABLE "attendance_records" DROP COLUMN IF EXISTS "user_id";
