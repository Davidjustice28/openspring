CREATE TABLE IF NOT EXISTS "metric_snapshots" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "state_id" integer REFERENCES "states"("id"),
  "source" text NOT NULL,
  "metric_key" text NOT NULL,
  "entity_key" text NOT NULL DEFAULT 'state',
  "entity_label" text,
  "value_numeric" numeric,
  "value_text" text,
  "unit" text,
  "observed_at" timestamptz NOT NULL,
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "payload" jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_dedupe"
  ON "metric_snapshots" ("source", "metric_key", "entity_key", "observed_at");

CREATE INDEX IF NOT EXISTS "metric_snapshots_query"
  ON "metric_snapshots" ("entity_key", "metric_key", "observed_at" DESC);

CREATE INDEX IF NOT EXISTS "metric_snapshots_state_query"
  ON "metric_snapshots" ("state_id", "metric_key", "observed_at" DESC);

CREATE TABLE IF NOT EXISTS "city_restriction_snapshots" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "city_slug" text NOT NULL,
  "city_name" text NOT NULL,
  "severity_level" text,
  "days_per_week" integer,
  "phase" text,
  "restriction" text,
  "hours" text,
  "end_date" text,
  "authority_url" text,
  "source_modified" date,
  "fetched_at" timestamptz NOT NULL DEFAULT now(),
  "raw" jsonb NOT NULL
);

CREATE INDEX IF NOT EXISTS "city_restriction_snapshots_lookup"
  ON "city_restriction_snapshots" ("state_id", "city_slug", "fetched_at" DESC);

CREATE TABLE IF NOT EXISTS "legislation_snapshots" (
  "id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "state_id" integer NOT NULL REFERENCES "states"("id"),
  "bill_identifier" text NOT NULL,
  "title" text,
  "latest_action" text,
  "latest_action_date" date,
  "session" text,
  "url" text,
  "fetched_at" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "legislation_snapshots_dedupe"
  ON "legislation_snapshots" ("state_id", "bill_identifier", "latest_action_date", "latest_action");

CREATE INDEX IF NOT EXISTS "legislation_snapshots_lookup"
  ON "legislation_snapshots" ("state_id", "bill_identifier", "fetched_at" DESC);

CREATE MATERIALIZED VIEW IF NOT EXISTS "metric_snapshots_weekly" AS
SELECT
  "state_id",
  "source",
  "metric_key",
  "entity_key",
  date_trunc('week', "observed_at") AS "week_start",
  avg("value_numeric") AS "avg_value",
  min("value_numeric") AS "min_value",
  max("value_numeric") AS "max_value",
  count(*)::int AS "sample_count"
FROM "metric_snapshots"
WHERE "value_numeric" IS NOT NULL
GROUP BY 1, 2, 3, 4, 5;

CREATE UNIQUE INDEX IF NOT EXISTS "metric_snapshots_weekly_dedupe"
  ON "metric_snapshots_weekly" ("entity_key", "metric_key", "week_start");
