ALTER TABLE "letter_assignments"
  ADD COLUMN IF NOT EXISTS "execution_start_date" timestamp,
  ADD COLUMN IF NOT EXISTS "execution_end_date" timestamp;
