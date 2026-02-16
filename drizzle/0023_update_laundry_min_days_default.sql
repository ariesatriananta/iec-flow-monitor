ALTER TABLE "settings_business_trip_allowance"
ALTER COLUMN "laundry_min_days" SET DEFAULT 7;

UPDATE "settings_business_trip_allowance"
SET "laundry_min_days" = 7
WHERE "laundry_min_days" = 3;
