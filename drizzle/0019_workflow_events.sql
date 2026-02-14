CREATE TABLE IF NOT EXISTS "workflow_events" (
  "id" text PRIMARY KEY NOT NULL,
  "module" text NOT NULL,
  "entity_id" text NOT NULL,
  "level" integer,
  "action" text NOT NULL,
  "from_status" text,
  "to_status" text,
  "note" text,
  "actor_user_id" text,
  "actor_employee_id" text,
  "created_at" timestamp NOT NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_events_actor_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "workflow_events"
      ADD CONSTRAINT "workflow_events_actor_user_id_users_id_fk"
      FOREIGN KEY ("actor_user_id") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'workflow_events_actor_employee_id_employees_id_fk'
  ) THEN
    ALTER TABLE "workflow_events"
      ADD CONSTRAINT "workflow_events_actor_employee_id_employees_id_fk"
      FOREIGN KEY ("actor_employee_id") REFERENCES "employees"("id")
      ON DELETE SET NULL ON UPDATE NO ACTION;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "workflow_events_module_entity_idx"
  ON "workflow_events" ("module", "entity_id");

CREATE INDEX IF NOT EXISTS "workflow_events_created_at_idx"
  ON "workflow_events" ("created_at");
