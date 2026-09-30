-- PostGIS spatial index for nearby search (Phase 3)
CREATE EXTENSION IF NOT EXISTS postgis;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "location" geography(Point, 4326);

UPDATE "User"
SET "location" = ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
WHERE "latitude" IS NOT NULL
  AND "longitude" IS NOT NULL
  AND "location" IS NULL;

CREATE INDEX IF NOT EXISTS "User_location_idx" ON "User" USING GIST ("location");
