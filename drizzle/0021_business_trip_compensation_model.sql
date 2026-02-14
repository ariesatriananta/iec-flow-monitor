ALTER TABLE "settings_business_trip_allowance"
ADD COLUMN IF NOT EXISTS "meal_per_day" numeric(15, 0) NOT NULL DEFAULT 50000,
ADD COLUMN IF NOT EXISTS "laundry_per_week" numeric(15, 0) NOT NULL DEFAULT 30000,
ADD COLUMN IF NOT EXISTS "laundry_min_days" integer NOT NULL DEFAULT 3,
ADD COLUMN IF NOT EXISTS "transport_option_json" text NOT NULL DEFAULT '[]';

ALTER TABLE "business_trips"
ADD COLUMN IF NOT EXISTS "is_out_of_town_overnight" boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "transport_option_id" text,
ADD COLUMN IF NOT EXISTS "compensation_breakdown_json" text,
ADD COLUMN IF NOT EXISTS "compensation_total" numeric(15, 0);
