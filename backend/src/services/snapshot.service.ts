import { and, desc, eq, gte, lt, sql } from 'drizzle-orm'
import type { CityRestriction, LegislationBill } from '@openspring/shared'
import { db } from '../db/index.js'
import {
  cityRestrictionSnapshots,
  legislationSnapshots,
  metricSnapshots,
  states,
} from '../db/schema.js'

export interface MetricSnapshotInput {
  stateId?: number | null
  source: string
  metricKey: string
  entityKey: string
  entityLabel?: string | null
  valueNumeric?: number | null
  valueText?: string | null
  unit?: string | null
  observedAt: Date
  payload?: unknown
}

const stateIdByFips = new Map<string, number>()
const stateIdBySlug = new Map<string, number>()

export async function resolveStateIdByFips(fips: string): Promise<number | null> {
  const cached = stateIdByFips.get(fips)
  if (cached != null) return cached

  const rows = await db.select({ id: states.id }).from(states).where(eq(states.fipsCode, fips)).limit(1)
  const id = rows[0]?.id ?? null
  if (id != null) stateIdByFips.set(fips, id)
  return id
}

export async function resolveStateIdBySlug(slug: string): Promise<number | null> {
  const cached = stateIdBySlug.get(slug)
  if (cached != null) return cached

  const rows = await db.select({ id: states.id }).from(states).where(eq(states.slug, slug)).limit(1)
  const id = rows[0]?.id ?? null
  if (id != null) stateIdBySlug.set(slug, id)
  return id
}

export function stateEntityKey(fips: string): string {
  return `state:${fips}`
}

export function siteEntityKey(monitoringLocationId: string): string {
  return `site:${monitoringLocationId}`
}

export async function recordMetricSnapshot(input: MetricSnapshotInput): Promise<void> {
  if (input.valueNumeric == null && input.valueText == null) return

  await db
    .insert(metricSnapshots)
    .values({
      stateId: input.stateId ?? null,
      source: input.source,
      metricKey: input.metricKey,
      entityKey: input.entityKey,
      entityLabel: input.entityLabel ?? null,
      valueNumeric: input.valueNumeric != null ? String(input.valueNumeric) : null,
      valueText: input.valueText ?? null,
      unit: input.unit ?? null,
      observedAt: input.observedAt,
      payload: input.payload ?? null,
    })
    .onConflictDoNothing()
}

export function recordMetricSnapshots(inputs: MetricSnapshotInput[]): void {
  for (const input of inputs) {
    void recordMetricSnapshot(input).catch(() => {})
  }
}

export async function recordMetricSnapshotBatch(inputs: MetricSnapshotInput[]): Promise<number> {
  const rows = inputs.filter((input) => input.valueNumeric != null || input.valueText != null)
  if (!rows.length) return 0

  const inserted = await db
    .insert(metricSnapshots)
    .values(
      rows.map((input) => ({
        stateId: input.stateId ?? null,
        source: input.source,
        metricKey: input.metricKey,
        entityKey: input.entityKey,
        entityLabel: input.entityLabel ?? null,
        valueNumeric: input.valueNumeric != null ? String(input.valueNumeric) : null,
        valueText: input.valueText ?? null,
        unit: input.unit ?? null,
        observedAt: input.observedAt,
        payload: input.payload ?? null,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: metricSnapshots.id })

  return inserted.length
}

function restrictionFingerprint(restriction: CityRestriction): string {
  return JSON.stringify({
    severityLevel: restriction.severityLevel,
    daysPerWeek: restriction.daysPerWeek,
    phase: restriction.phase,
    restriction: restriction.restriction,
    hours: restriction.hours,
    endDate: restriction.endDate,
    dateModified: restriction.dateModified,
  })
}

export async function recordCityRestrictionSnapshot(
  stateId: number,
  restriction: CityRestriction,
  options?: { skipIfUnchanged?: boolean },
): Promise<boolean> {
  if (options?.skipIfUnchanged) {
    const latest = await db
      .select({ raw: cityRestrictionSnapshots.raw })
      .from(cityRestrictionSnapshots)
      .where(and(eq(cityRestrictionSnapshots.stateId, stateId), eq(cityRestrictionSnapshots.citySlug, restriction.slug)))
      .orderBy(desc(cityRestrictionSnapshots.fetchedAt))
      .limit(1)

    if (latest[0]?.raw && restrictionFingerprint(latest[0].raw as CityRestriction) === restrictionFingerprint(restriction)) {
      return false
    }
  }

  await db.insert(cityRestrictionSnapshots).values({
    stateId,
    citySlug: restriction.slug,
    cityName: restriction.city,
    severityLevel: restriction.severityLevel,
    daysPerWeek: restriction.daysPerWeek,
    phase: restriction.phase,
    restriction: restriction.restriction,
    hours: restriction.hours,
    endDate: restriction.endDate,
    authorityUrl: restriction.authorityUrl,
    sourceModified: restriction.dateModified ?? null,
    raw: restriction,
  })

  return true
}

export function recordCityRestrictionSnapshotAsync(
  stateId: number,
  restriction: CityRestriction,
  options?: { skipIfUnchanged?: boolean },
): void {
  void recordCityRestrictionSnapshot(stateId, restriction, options).catch(() => {})
}

export async function recordLegislationSnapshots(stateId: number, bills: LegislationBill[]): Promise<number> {
  if (!bills.length) return 0

  const inserted = await db
    .insert(legislationSnapshots)
    .values(
      bills.map((bill) => ({
        stateId,
        billIdentifier: bill.identifier,
        title: bill.title,
        latestAction: bill.latestAction,
        latestActionDate: bill.latestActionDate,
        session: bill.session,
        url: bill.url,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: legislationSnapshots.id })

  return inserted.length
}

export function recordLegislationSnapshotsAsync(stateId: number, bills: LegislationBill[]): void {
  void recordLegislationSnapshots(stateId, bills).catch(() => {})
}

export async function purgeOldMetricSnapshots(retentionDays = 730): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
  const deleted = await db.delete(metricSnapshots).where(lt(metricSnapshots.observedAt, cutoff)).returning({ id: metricSnapshots.id })
  return deleted.length
}

export async function refreshMetricSnapshotsWeeklyView(): Promise<void> {
  await db.execute(sql`REFRESH MATERIALIZED VIEW CONCURRENTLY metric_snapshots_weekly`)
}

export async function downsampleOldMetricSnapshots(dailyRetentionDays = 90): Promise<number> {
  const cutoff = new Date(Date.now() - dailyRetentionDays * 86_400_000)

  const deleted = await db.execute(sql`
    DELETE FROM metric_snapshots AS ms
    USING (
      SELECT
        source,
        metric_key,
        entity_key,
        date_trunc('day', observed_at) AS day_bucket,
        max(observed_at) AS keep_at
      FROM metric_snapshots
      WHERE observed_at < ${cutoff}
      GROUP BY 1, 2, 3, 4
      HAVING count(*) > 1
    ) AS grouped
    WHERE ms.source = grouped.source
      AND ms.metric_key = grouped.metric_key
      AND ms.entity_key = grouped.entity_key
      AND date_trunc('day', ms.observed_at) = grouped.day_bucket
      AND ms.observed_at < grouped.keep_at
      AND ms.observed_at < ${cutoff}
  `)

  return Number((deleted as { rowCount?: number }).rowCount ?? 0)
}

export interface MetricTrendPoint {
  observedAt: string
  value: number | null
  valueText: string | null
  unit: string | null
}

export async function getMetricTrend(
  entityKey: string,
  metricKey: string,
  days = 90,
): Promise<MetricTrendPoint[]> {
  const since = new Date(Date.now() - days * 86_400_000)
  const rows = await db
    .select({
      observedAt: metricSnapshots.observedAt,
      valueNumeric: metricSnapshots.valueNumeric,
      valueText: metricSnapshots.valueText,
      unit: metricSnapshots.unit,
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

  return rows.map((row) => ({
    observedAt: row.observedAt.toISOString(),
    value: row.valueNumeric != null ? Number(row.valueNumeric) : null,
    valueText: row.valueText,
    unit: row.unit,
  }))
}

export interface RestrictionChange {
  citySlug: string
  cityName: string
  changedAt: string
  previous: Pick<CityRestriction, 'severityLevel' | 'daysPerWeek' | 'restriction' | 'phase' | 'hours' | 'endDate'>
  current: Pick<CityRestriction, 'severityLevel' | 'daysPerWeek' | 'restriction' | 'phase' | 'hours' | 'endDate'>
}

export async function getRestrictionChanges(stateId: number, citySlug?: string, limit = 20): Promise<RestrictionChange[]> {
  const rows = await db
    .select()
    .from(cityRestrictionSnapshots)
    .where(
      citySlug
        ? and(eq(cityRestrictionSnapshots.stateId, stateId), eq(cityRestrictionSnapshots.citySlug, citySlug))
        : eq(cityRestrictionSnapshots.stateId, stateId),
    )
    .orderBy(desc(cityRestrictionSnapshots.fetchedAt))
    .limit(500)

  const changes: RestrictionChange[] = []
  const lastByCity = new Map<string, CityRestriction>()

  for (const row of [...rows].reverse()) {
    const current = row.raw as CityRestriction
    const previous = lastByCity.get(row.citySlug)
    if (previous && restrictionFingerprint(previous) !== restrictionFingerprint(current)) {
      changes.push({
        citySlug: row.citySlug,
        cityName: row.cityName,
        changedAt: row.fetchedAt.toISOString(),
        previous: {
          severityLevel: previous.severityLevel,
          daysPerWeek: previous.daysPerWeek,
          restriction: previous.restriction,
          phase: previous.phase,
          hours: previous.hours,
          endDate: previous.endDate,
        },
        current: {
          severityLevel: current.severityLevel,
          daysPerWeek: current.daysPerWeek,
          restriction: current.restriction,
          phase: current.phase,
          hours: current.hours,
          endDate: current.endDate,
        },
      })
    }
    lastByCity.set(row.citySlug, current)
  }

  return changes.reverse().slice(0, limit)
}

export interface LegislationStatusChange {
  billIdentifier: string
  title: string | null
  changedAt: string
  previousAction: string | null
  currentAction: string | null
  previousActionDate: string | null
  currentActionDate: string | null
  url: string | null
}

export async function getLegislationStatusChanges(stateId: number, limit = 20): Promise<LegislationStatusChange[]> {
  const rows = await db
    .select()
    .from(legislationSnapshots)
    .where(eq(legislationSnapshots.stateId, stateId))
    .orderBy(desc(legislationSnapshots.fetchedAt))
    .limit(1000)

  const changes: LegislationStatusChange[] = []
  const lastByBill = new Map<string, (typeof rows)[number]>()

  for (const row of [...rows].reverse()) {
    const previous = lastByBill.get(row.billIdentifier)
    const actionKey = `${row.latestActionDate ?? ''}|${row.latestAction ?? ''}`
    const prevKey = previous ? `${previous.latestActionDate ?? ''}|${previous.latestAction ?? ''}` : null

    if (previous && actionKey !== prevKey) {
      changes.push({
        billIdentifier: row.billIdentifier,
        title: row.title,
        changedAt: row.fetchedAt.toISOString(),
        previousAction: previous.latestAction,
        currentAction: row.latestAction,
        previousActionDate: previous.latestActionDate,
        currentActionDate: row.latestActionDate,
        url: row.url,
      })
    }

    lastByBill.set(row.billIdentifier, row)
  }

  return changes.reverse().slice(0, limit)
}
