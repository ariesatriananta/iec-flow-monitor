CREATE TABLE IF NOT EXISTS "reimbursement_attachments" (
  "id" text PRIMARY KEY NOT NULL,
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

