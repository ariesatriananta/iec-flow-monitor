CREATE TABLE IF NOT EXISTS "employees" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "employee_code" text NOT NULL,
  "position" text,
  "department" text,
  "work_location" text,
  "phone" text,
  "email" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "employees_user_id_unique" ON "employees" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_employee_code_unique" ON "employees" ("employee_code");
CREATE UNIQUE INDEX IF NOT EXISTS "employees_email_unique" ON "employees" ("email");

CREATE TABLE IF NOT EXISTS "attendance_records" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "attendance_date" timestamp NOT NULL,
  "check_in_at" timestamp,
  "check_out_at" timestamp,
  "check_in_location" text,
  "check_out_location" text,
  "status" text NOT NULL DEFAULT 'PRESENT',
  "notes" text,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "attendance_records_user_date_unique"
  ON "attendance_records" ("user_id", "attendance_date");
CREATE INDEX IF NOT EXISTS "attendance_records_user_id_idx" ON "attendance_records" ("user_id");
CREATE INDEX IF NOT EXISTS "attendance_records_date_idx" ON "attendance_records" ("attendance_date");

CREATE TABLE IF NOT EXISTS "leave_requests" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "leave_type" text NOT NULL,
  "reason" text NOT NULL,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "admin_note" text,
  "approved_by" text REFERENCES "users"("id"),
  "approved_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "leave_requests_user_id_idx" ON "leave_requests" ("user_id");
CREATE INDEX IF NOT EXISTS "leave_requests_status_idx" ON "leave_requests" ("status");

CREATE TABLE IF NOT EXISTS "business_trips" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "destination_city" text NOT NULL,
  "company_name" text NOT NULL,
  "purpose" text,
  "start_date" timestamp NOT NULL,
  "end_date" timestamp NOT NULL,
  "status" text NOT NULL DEFAULT 'SUBMITTED',
  "admin_note" text,
  "approved_by" text REFERENCES "users"("id"),
  "approved_at" timestamp,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE INDEX IF NOT EXISTS "business_trips_user_id_idx" ON "business_trips" ("user_id");
CREATE INDEX IF NOT EXISTS "business_trips_status_idx" ON "business_trips" ("status");

CREATE TABLE IF NOT EXISTS "reimbursements" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "category" text NOT NULL,
  "amount" numeric(15, 0) NOT NULL,
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

CREATE INDEX IF NOT EXISTS "reimbursements_user_id_idx" ON "reimbursements" ("user_id");
CREATE INDEX IF NOT EXISTS "reimbursements_status_idx" ON "reimbursements" ("status");
