CREATE TABLE IF NOT EXISTS "notifications" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "users"("id"),
  "type" text NOT NULL,
  "title" text NOT NULL,
  "message" text NOT NULL,
  "entity_type" text,
  "entity_id" text,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp NOT NULL,
  "read_at" timestamp
);

CREATE INDEX IF NOT EXISTS "notifications_user_id_idx" ON "notifications" ("user_id");
CREATE INDEX IF NOT EXISTS "notifications_user_unread_created_idx" ON "notifications" ("user_id", "is_read", "created_at");
