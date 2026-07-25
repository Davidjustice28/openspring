import {
  bigint,
  boolean,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

export const states = pgTable('states', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  abbreviation: text('abbreviation').notNull(),
  slug: text('slug').notNull().unique(),
  fipsCode: text('fips_code').notNull().unique(),
  population: bigint('population', { mode: 'number' }),
  medianHouseholdIncome: integer('median_household_income'),
  landAreaSqM: bigint('land_area_sq_m', { mode: 'number' }),
  waterAreaSqM: bigint('water_area_sq_m', { mode: 'number' }),
  centroidLat: numeric('centroid_lat'),
  centroidLng: numeric('centroid_lng'),
  censusUpdatedAt: timestamp('census_updated_at'),
  geographyUpdatedAt: timestamp('geography_updated_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const weatherData = pgTable('weather_data', {
  id: serial('id').primaryKey(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  avgTempC: numeric('avg_temp_c'),
  avgTempHighC: numeric('avg_temp_high_c'),
  avgTempLowC: numeric('avg_temp_low_c'),
  periodStart: date('period_start'),
  periodEnd: date('period_end'),
  monthlyTemps: jsonb('monthly_temps'),
  source: text('source').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
})

export const waterData = pgTable('water_data', {
  id: serial('id').primaryKey(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  metrics: jsonb('metrics'),
  trends: jsonb('trends'),
  source: text('source').notNull(),
  fetchedAt: timestamp('fetched_at').defaultNow().notNull(),
})

export const apiCache = pgTable('api_cache', {
  id: serial('id').primaryKey(),
  cacheKey: text('cache_key').notNull().unique(),
  endpoint: text('endpoint').notNull(),
  response: jsonb('response').notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const contributions = pgTable('contributions', {
  id: uuid('id').defaultRandom().primaryKey(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  city: text('city').notNull(),
  zip: text('zip').notNull(),
  waterUsedGallons: numeric('water_used_gallons').notNull(),
  billCostCents: integer('bill_cost_cents').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  source: text('source').notNull(),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const emailSubscriptions = pgTable('email_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  email: text('email').notNull().unique(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  stateUpdates: boolean('state_updates').notNull().default(true),
  monthlyUploadReminders: boolean('monthly_upload_reminders').notNull().default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
})

export const metricSnapshots = pgTable('metric_snapshots', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  stateId: integer('state_id').references(() => states.id),
  source: text('source').notNull(),
  metricKey: text('metric_key').notNull(),
  entityKey: text('entity_key').notNull().default('state'),
  entityLabel: text('entity_label'),
  valueNumeric: numeric('value_numeric'),
  valueText: text('value_text'),
  unit: text('unit'),
  observedAt: timestamp('observed_at', { withTimezone: true }).notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  payload: jsonb('payload'),
})

export const cityRestrictionSnapshots = pgTable('city_restriction_snapshots', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  citySlug: text('city_slug').notNull(),
  cityName: text('city_name').notNull(),
  severityLevel: text('severity_level'),
  daysPerWeek: integer('days_per_week'),
  phase: text('phase'),
  restriction: text('restriction'),
  hours: text('hours'),
  endDate: text('end_date'),
  authorityUrl: text('authority_url'),
  sourceModified: date('source_modified'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
  raw: jsonb('raw').notNull(),
})

export const legislationSnapshots = pgTable('legislation_snapshots', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  stateId: integer('state_id').references(() => states.id).notNull(),
  billIdentifier: text('bill_identifier').notNull(),
  title: text('title'),
  latestAction: text('latest_action'),
  latestActionDate: date('latest_action_date'),
  session: text('session'),
  url: text('url'),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).defaultNow().notNull(),
})
