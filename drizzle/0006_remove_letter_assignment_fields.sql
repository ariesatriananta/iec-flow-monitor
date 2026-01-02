ALTER TABLE "letter_assignments"
  DROP COLUMN IF EXISTS "recipient_name",
  DROP COLUMN IF EXISTS "recipient_address",
  DROP COLUMN IF EXISTS "body_intro",
  DROP COLUMN IF EXISTS "closing_text",
  DROP COLUMN IF EXISTS "city";
