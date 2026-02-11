DO $$
BEGIN
  CREATE TYPE "user_role" AS ENUM ('ADMIN', 'STAFF');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

UPDATE "users"
SET "role" = UPPER("role")
WHERE "role" IS NOT NULL;

ALTER TABLE "users"
  ALTER COLUMN "role" TYPE "user_role"
  USING
    CASE
      WHEN "role"::text = 'STAFF' THEN 'STAFF'::"user_role"
      ELSE 'ADMIN'::"user_role"
    END;

ALTER TABLE "users"
  ALTER COLUMN "role" SET DEFAULT 'ADMIN';
