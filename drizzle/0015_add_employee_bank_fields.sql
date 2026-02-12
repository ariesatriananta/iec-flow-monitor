ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "bank_account_name" text;

ALTER TABLE "employees"
ADD COLUMN IF NOT EXISTS "bank_account_number" text;
