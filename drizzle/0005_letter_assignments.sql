CREATE TABLE IF NOT EXISTS "letter_assignments" (
  "id" text PRIMARY KEY NOT NULL,
  "letter_id" text NOT NULL,
  "title" text NOT NULL,
  "audit_period_text" text NOT NULL,
  "recipient_name" text NOT NULL,
  "recipient_address" text NOT NULL,
  "body_intro" text NOT NULL,
  "closing_text" text NOT NULL,
  "city" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL,
  CONSTRAINT "letter_assignments_letter_id_unique" UNIQUE ("letter_id")
);

CREATE TABLE IF NOT EXISTS "letter_assignment_members" (
  "id" text PRIMARY KEY NOT NULL,
  "assignment_id" text NOT NULL,
  "name" text NOT NULL,
  "role" text NOT NULL,
  "order" integer NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "letter_assignments"
    ADD CONSTRAINT "letter_assignments_letter_id_letters_id_fk"
    FOREIGN KEY ("letter_id") REFERENCES "letters" ("id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  ALTER TABLE "letter_assignment_members"
    ADD CONSTRAINT "letter_assignment_members_assignment_id_letter_assignments_id_fk"
    FOREIGN KEY ("assignment_id") REFERENCES "letter_assignments" ("id");
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "letter_assignment_members_assignment_id_idx"
  ON "letter_assignment_members" ("assignment_id");
