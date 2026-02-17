ALTER TABLE "reimbursement_attachments"
  ADD COLUMN IF NOT EXISTS "reimbursement_item_id" text REFERENCES "reimbursement_items"("id");

CREATE INDEX IF NOT EXISTS "reimbursement_attachments_reimbursement_item_id_idx"
  ON "reimbursement_attachments" ("reimbursement_item_id");
