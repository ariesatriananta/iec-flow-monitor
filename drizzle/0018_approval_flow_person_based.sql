ALTER TABLE "settings_approval_flow"
ADD COLUMN "leave_approver_level1_employee_id" text,
ADD COLUMN "leave_approver_level2_employee_id" text,
ADD COLUMN "reimbursement_approver_level1_employee_id" text,
ADD COLUMN "reimbursement_approver_level2_employee_id" text,
ADD COLUMN "business_trip_approver_level1_employee_id" text,
ADD COLUMN "business_trip_approver_level2_employee_id" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_leave_approver_level1_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_leave_approver_level1_employee_id_fkey"
      FOREIGN KEY ("leave_approver_level1_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_leave_approver_level2_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_leave_approver_level2_employee_id_fkey"
      FOREIGN KEY ("leave_approver_level2_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_reimbursement_approver_level1_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_reimbursement_approver_level1_employee_id_fkey"
      FOREIGN KEY ("reimbursement_approver_level1_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_reimbursement_approver_level2_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_reimbursement_approver_level2_employee_id_fkey"
      FOREIGN KEY ("reimbursement_approver_level2_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_business_trip_approver_level1_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_business_trip_approver_level1_employee_id_fkey"
      FOREIGN KEY ("business_trip_approver_level1_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'settings_approval_flow_business_trip_approver_level2_employee_id_fkey'
  ) THEN
    ALTER TABLE "settings_approval_flow"
      ADD CONSTRAINT "settings_approval_flow_business_trip_approver_level2_employee_id_fkey"
      FOREIGN KEY ("business_trip_approver_level2_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;
