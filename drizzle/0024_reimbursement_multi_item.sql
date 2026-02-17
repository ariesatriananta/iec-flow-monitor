DROP TABLE IF EXISTS "reimbursement_attachments";
DROP TABLE IF EXISTS "reimbursements";

CREATE TABLE IF NOT EXISTS "reimbursements" (
  "id" text PRIMARY KEY,
  "employee_id" text NOT NULL REFERENCES "employees"("id"),
  "category" text NOT NULL,
  "amount" numeric(15, 0) NOT NULL,
  "item_count" integer NOT NULL DEFAULT 1,
  "submission_date" timestamp NOT NULL,
  "description" text,
  "receipt_url" text,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "admin_note" text,
  "approved_by" text REFERENCES "users"("id"),
  "approved_at" timestamp,
  "paid_at" timestamp,
  "paid_proof_url" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "reimbursements_employee_id_idx"
  ON "reimbursements" ("employee_id");
CREATE INDEX IF NOT EXISTS "reimbursements_status_idx"
  ON "reimbursements" ("status");
CREATE INDEX IF NOT EXISTS "reimbursements_submission_date_idx"
  ON "reimbursements" ("submission_date");

CREATE TABLE IF NOT EXISTS "reimbursement_items" (
  "id" text PRIMARY KEY,
  "reimbursement_id" text NOT NULL REFERENCES "reimbursements"("id"),
  "expense_date" timestamp NOT NULL,
  "category" text NOT NULL,
  "description" text,
  "amount" numeric(15, 0) NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "reimbursement_items_reimbursement_id_idx"
  ON "reimbursement_items" ("reimbursement_id");
CREATE INDEX IF NOT EXISTS "reimbursement_items_expense_date_idx"
  ON "reimbursement_items" ("expense_date");

CREATE TABLE IF NOT EXISTS "reimbursement_attachments" (
  "id" text PRIMARY KEY,
  "reimbursement_id" text NOT NULL REFERENCES "reimbursements"("id"),
  "purpose" text NOT NULL,
  "file_url" text NOT NULL,
  "file_key" text,
  "file_name" text NOT NULL,
  "content_type" text,
  "file_size" integer,
  "uploaded_by" text NOT NULL REFERENCES "users"("id"),
  "created_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "reimbursement_attachments_reimbursement_id_idx"
  ON "reimbursement_attachments" ("reimbursement_id");
CREATE INDEX IF NOT EXISTS "reimbursement_attachments_purpose_idx"
  ON "reimbursement_attachments" ("purpose");
