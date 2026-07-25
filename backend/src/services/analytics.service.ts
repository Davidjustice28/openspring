import { and, desc, eq, gte } from 'drizzle-orm'
import { US_STATES } from '@openspring/shared'
import { db } from '../db/index.js'
import { metricSnapshots, states } from '../db/schema.js'
import {
  getLegislationStatusChanges,
  getMetricTrend,
  getRestrictionChanges,
  type MetricTrendPoint,
  type RestrictionChange,
  type LegislationStatusChange,
} from './snapshot.service.js'

export interface SiteLevelTrendResponse {
  siteId: string
  metricKey: string
  days: number
  points: MetricTrendPoint[]
}

export interface StateMetricsTrendResponse {
  stateSlug: string
  metricKeys: string[]
  days: number
  series: { metricKey: string; points: MetricTrendPoint[] }[]
}

export async function getSiteLevelTrend(siteId: string, days: number): Promise<SiteLevelTrendResponse> {
  const entityKey = siteId.startsWith('site:') ? siteId : `site:${siteId}`
  let metricKey = 'water_level'
  let points = await getMetricTrend(entityKey, metricKey, days)
  if (!points.length) {
    metricKey = 'discharge_cfs'
    points = await getMetricTrend(entityKey, metricKey, days)
  }

  return {
    siteId: entityKey.replace(/^site:/, ''),
    metricKey,
    days,
    points,
  }
}

export async function getStateMetricsTrend(
  stateSlug: string,
  metricKeys: string[],
  days: number,
): Promise<StateMetricsTrendResponse | null> {
  const stateRows = await db.select().from(states).where(eq(states.slug, stateSlug)).limit(1)
  const state = stateRows[0]
  if (!state) return null

  const entityKey = `state:${state.fipsCode}`
  const series = await Promise.all(
    metricKeys.map(async (metricKey) => ({
      metricKey,
      points: await getMetricTrend(entityKey, metricKey, days),
    })),
  )

  return { stateSlug, metricKeys, days, series }
}

export async function getWeeklyMetricSummary(
  entityKey: string,
  metricKey: string,
  weeks = 52,
): Promise<{ weekStart: string; avgValue: number | null; sampleCount: number }[]> {
  const since = new Date(Date.now() - weeks * 7 * 86_400_000)
  const rows = await db
    .select({
      observedAt: metricSnapshots.observedAt,
      valueNumeric: metricSnapshots.valueNumeric,
    })
    .from(metricSnapshots)
    .where(
      and(
        eq(metricSnapshots.entityKey, entityKey),
        eq(metricSnapshots.metricKey, metricKey),
        gte(metricSnapshots.observedAt, since),
      ),
    )
    .orderBy(metricSnapshots.observedAt)

  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const weekStart = new Date(row.observedAt)
    weekStart.setUTCHours(0, 0, 0, 0)
    weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay())
    const key = weekStart.toISOString().slice(0, 10)
    if (!buckets.has(key)) buckets.set(key, [])
    if (row.valueNumeric != null) buckets.get(key)!.push(Number(row.valueNumeric))
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, values]) => ({
      weekStart,
      avgValue: values.length ? values.reduce((a, b) => a + b, 0) / values.length : null,
      sampleCount: values.length,
    }))
}

export async function getStateRestrictionChanges(
  stateSlug: string,
  citySlug?: string,
  limit = 20,
): Promise<{ stateSlug: string; changes: RestrictionChange[] } | null> {
  const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.slug, stateSlug)).limit(1)
  const stateId = stateRows[0]?.id
  if (!stateId) return null

  const changes = await getRestrictionChanges(stateId, citySlug, limit)
  return { stateSlug, changes }
}

export async function getStateLegislationChanges(
  stateSlug: string,
  limit = 20,
): Promise<{ stateSlug: string; changes: LegislationStatusChange[] } | null> {
  const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.slug, stateSlug)).limit(1)
  const stateId = stateRows[0]?.id
  if (!stateId) return null

  const changes = await getLegislationStatusChanges(stateId, limit)
  return { stateSlug, changes }
}

export async function listTrackedSites(stateSlug?: string): Promise<
  { entityKey: string; entityLabel: string | null; metricKey: string; lastObservedAt: string | null }[]
> {
  if (stateSlug) {
    const stateRows = await db.select({ id: states.id }).from(states).where(eq(states.slug, stateSlug)).limit(1)
    if (!stateRows[0]) return []
  }

  const rows = stateSlug
    ? await db
        .select({
          entityKey: metricSnapshots.entityKey,
          entityLabel: metricSnapshots.entityLabel,
          metricKey: metricSnapshots.metricKey,
          observedAt: metricSnapshots.observedAt,
        })
        .from(metricSnapshots)
        .innerJoin(states, eq(metricSnapshots.stateId, states.id))
        .where(eq(states.slug, stateSlug!))
        .orderBy(desc(metricSnapshots.observedAt))
        .limit(500)
    : await db
        .select({
          entityKey: metricSnapshots.entityKey,
          entityLabel: metricSnapshots.entityLabel,
          metricKey: metricSnapshots.metricKey,
          observedAt: metricSnapshots.observedAt,
        })
        .from(metricSnapshots)
        .orderBy(desc(metricSnapshots.observedAt))
        .limit(500)

  const seen = new Set<string>()
  const results: { entityKey: string; entityLabel: string | null; metricKey: string; lastObservedAt: string | null }[] = []

  for (const row of rows) {
    if (!row.entityKey.startsWith('site:')) continue
    const key = `${row.entityKey}:${row.metricKey}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push({
      entityKey: row.entityKey,
      entityLabel: row.entityLabel,
      metricKey: row.metricKey,
      lastObservedAt: row.observedAt.toISOString(),
    })
  }

  return results
}

export { US_STATES }
