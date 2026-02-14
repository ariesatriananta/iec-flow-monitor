CREATE TABLE IF NOT EXISTS "settings_business_trip_allowance" (
  "id" text PRIMARY KEY NOT NULL,
  "allowance_rule_json" text NOT NULL,
  "created_at" timestamp NOT NULL,
  "updated_at" timestamp NOT NULL
);

ALTER TABLE "business_trips"
ADD COLUMN IF NOT EXISTS "allowance_rule_id" text,
ADD COLUMN IF NOT EXISTS "allowance_rule_label" text,
ADD COLUMN IF NOT EXISTS "allowance_daily" numeric(15, 0),
ADD COLUMN IF NOT EXISTS "allowance_days" integer,
ADD COLUMN IF NOT EXISTS "allowance_total" numeric(15, 0);
