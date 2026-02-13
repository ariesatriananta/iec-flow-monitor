ALTER TABLE "leave_requests" ADD COLUMN IF NOT EXISTS "employee_id" text;
ALTER TABLE "business_trips" ADD COLUMN IF NOT EXISTS "employee_id" text;
ALTER TABLE "reimbursements" ADD COLUMN IF NOT EXISTS "employee_id" text;

UPDATE "leave_requests" AS lr
SET "employee_id" = u."employee_id"
FROM "users" AS u
WHERE lr."user_id" = u."id"
  AND lr."employee_id" IS NULL;

UPDATE "business_trips" AS bt
SET "employee_id" = u."employee_id"
FROM "users" AS u
WHERE bt."user_id" = u."id"
  AND bt."employee_id" IS NULL;

UPDATE "reimbursements" AS r
SET "employee_id" = u."employee_id"
FROM "users" AS u
WHERE r."user_id" = u."id"
  AND r."employee_id" IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "leave_requests" WHERE "employee_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "business_trips" WHERE "employee_id" IS NULL)
     OR EXISTS (SELECT 1 FROM "reimbursements" WHERE "employee_id" IS NULL)
  THEN
    RAISE EXCEPTION 'Migration gagal: masih ada workflow HR tanpa employee. Hubungkan user ke employee terlebih dulu.';
  END IF;
END
$$;

ALTER TABLE "leave_requests"
  ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "business_trips"
  ALTER COLUMN "employee_id" SET NOT NULL;
ALTER TABLE "reimbursements"
  ALTER COLUMN "employee_id" SET NOT NULL;

ALTER TABLE "leave_requests"
  ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "business_trips"
  ADD CONSTRAINT "business_trips_employee_id_employees_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;
ALTER TABLE "reimbursements"
  ADD CONSTRAINT "reimbursements_employee_id_employees_id_fk"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id")
  ON DELETE NO ACTION ON UPDATE NO ACTION;

DROP INDEX IF EXISTS "leave_requests_user_id_idx";
DROP INDEX IF EXISTS "business_trips_user_id_idx";
DROP INDEX IF EXISTS "reimbursements_user_id_idx";

CREATE INDEX IF NOT EXISTS "leave_requests_employee_id_idx"
  ON "leave_requests" ("employee_id");
CREATE INDEX IF NOT EXISTS "business_trips_employee_id_idx"
  ON "business_trips" ("employee_id");
CREATE INDEX IF NOT EXISTS "reimbursements_employee_id_idx"
  ON "reimbursements" ("employee_id");

ALTER TABLE "leave_requests" DROP CONSTRAINT IF EXISTS "leave_requests_user_id_users_id_fk";
ALTER TABLE "business_trips" DROP CONSTRAINT IF EXISTS "business_trips_user_id_users_id_fk";
ALTER TABLE "reimbursements" DROP CONSTRAINT IF EXISTS "reimbursements_user_id_users_id_fk";

ALTER TABLE "leave_requests" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "business_trips" DROP COLUMN IF EXISTS "user_id";
ALTER TABLE "reimbursements" DROP COLUMN IF EXISTS "user_id";
