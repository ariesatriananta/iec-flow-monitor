ALTER TABLE "reimbursement_items"
  ADD COLUMN IF NOT EXISTS "client_name" text;
