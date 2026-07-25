CREATE TABLE IF NOT EXISTS "states" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "abbreviation" text NOT NULL,
  "slug" text NOT NULL UNIQUE,
  "fips_code" text NOT NULL UNIQUE,
  "population" bigint,
  "median_household_income" integer,
  "land_area_sq_m" bigint,
  "water_area_sq_m" bigint,
  "centroid_lat" numeric,
  "centroid_lng" numeric,
  "census_updated_at" timestamp,
  "geography_updated_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "weather_data" (
  "id" serial PRIMARY KEY NOT NULL,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "avg_temp_c" numeric,
  "avg_temp_high_c" numeric,
  "avg_temp_low_c" numeric,
  "period_start" date,
  "period_end" date,
  "monthly_temps" jsonb,
  "source" text NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "water_data" (
  "id" serial PRIMARY KEY NOT NULL,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "metrics" jsonb,
  "trends" jsonb,
  "source" text NOT NULL,
  "fetched_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "api_cache" (
  "id" serial PRIMARY KEY NOT NULL,
  "cache_key" text NOT NULL UNIQUE,
  "endpoint" text NOT NULL,
  "response" jsonb NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "contributions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "city" text NOT NULL,
  "zip" text NOT NULL,
  "water_used_gallons" numeric NOT NULL,
  "bill_cost_cents" integer NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "source" text NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "email_subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "email" text NOT NULL UNIQUE,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "created_at" timestamp DEFAULT now() NOT NULL
);
