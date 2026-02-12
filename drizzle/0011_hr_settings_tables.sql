CREATE TABLE IF NOT EXISTS "settings_approval_flow" (
  "id" text PRIMARY KEY NOT NULL,
  "leave_approval_levels" integer NOT NULL DEFAULT 2,
  "leave_approver_level1_role" text NOT NULL,
  "leave_approver_level2_role" text NOT NULL,
  "reimbursement_approval_levels" integer NOT NULL DEFAULT 2,
  "reimbursement_approver_level1_role" text NOT NULL,
  "reimbursement_approver_level2_role" text NOT NULL,
  "business_trip_approval_levels" integer NOT NULL DEFAULT 2,
  "business_trip_approver_level1_role" text NOT NULL,
  "business_trip_approver_level2_role" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings_work_schedule" (
  "id" text PRIMARY KEY NOT NULL,
  "timezone" text NOT NULL,
  "check_in_deadline" text NOT NULL,
  "work_start" text NOT NULL,
  "work_end" text NOT NULL,
  "allow_flexible_checkout" boolean NOT NULL DEFAULT true,
  "working_days_json" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

CREATE TABLE IF NOT EXISTS "settings_reimbursement_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "transport_limit" numeric(15, 0) NOT NULL,
  "meal_limit" numeric(15, 0) NOT NULL,
  "other_limit" numeric(15, 0) NOT NULL,
  "position_limit_json" text NOT NULL,
  "max_files_per_request" integer NOT NULL DEFAULT 10,
  "max_file_size_mb" integer NOT NULL DEFAULT 5,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

