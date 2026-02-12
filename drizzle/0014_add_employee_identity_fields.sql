ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "full_name" text;

ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "nip" text;

ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "gender" text;

CREATE UNIQUE INDEX IF NOT EXISTS "employees_nip_unique" ON "employees" ("nip");

UPDATE "employees" AS e
SET "full_name" = u."name"
FROM "users" AS u
WHERE u."employee_id" = e."id"
  AND (e."full_name" IS NULL OR btrim(e."full_name") = '');
