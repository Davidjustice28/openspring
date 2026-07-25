import { eq } from 'drizzle-orm'
import type { ChartPoint, ContributionMetadata, GroupedAnalytics } from '@openspring/shared'
import {
  isMostlyShower,
  isMostlyTub,
  isOwnerOccupied,
  lotSizeLabel,
  normalizeHouseholdSize,
  normalizeOwnershipLabel,
} from '@openspring/shared'
import { db } from '../db/index.js'
import { contributions } from '../db/schema.js'

const MIN_GROUP_SIZE = 5

interface ContributionRow {
  waterUsedGallons: string
  billCostCents: number
  periodStart: string
  periodEnd: string
  metadata: ContributionMetadata | null
  createdAt: Date
}

function periodDays(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime()
  return Math.max(1, Math.round(ms / 86_400_000) + 1)
}

function monthlyGallons(gallons: number, start: string, end: string): number {
  return (gallons / periodDays(start, end)) * 30.44
}

function monthlyBillDollars(cents: number, start: string, end: string): number {
  return (cents / 100) * (30.44 / periodDays(start, end))
}

function seasonFromDate(dateStr: string): string {
  const month = new Date(`${dateStr}T12:00:00Z`).getUTCMonth() + 1
  if (month === 12 || month <= 2) return 'Winter'
  if (month <= 5) return 'Spring'
  if (month <= 8) return 'Summer'
  return 'Fall'
}

function monthLabel(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleString('en-US', { month: 'short' })
}

function groupChartPoints(
  rows: ContributionRow[],
  labelFor: (row: ContributionRow) => string | null,
): ChartPoint[] {
  const buckets = new Map<string, number[]>()
  for (const row of rows) {
    const label = labelFor(row)
    if (!label) continue
    const value = monthlyGallons(Number(row.waterUsedGallons), row.periodStart, row.periodEnd)
    if (!Number.isFinite(value)) continue
    if (!buckets.has(label)) buckets.set(label, [])
    buckets.get(label)!.push(value)
  }

  return [...buckets.entries()]
    .filter(([, values]) => values.length >= MIN_GROUP_SIZE)
    .map(([group, values]) => ({
      group,
      use: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    }))
    .sort((a, b) => b.use - a.use)
}

function outdoorFeatureRows(rows: ContributionRow[]): ChartPoint[] {
  const features = [
    { label: 'Pool', pick: (m: ContributionMetadata) => m.hasPool === true },
    { label: 'Sprinklers', pick: (m: ContributionMetadata) => m.hasSprinklers === true },
    { label: 'Garden', pick: (m: ContributionMetadata) => m.hasGarden === true },
    { label: 'No outdoor feature', pick: (m: ContributionMetadata) => !m.hasPool && !m.hasSprinklers && !m.hasGarden },
  ] as const

  const points: ChartPoint[] = []
  for (const { label, pick } of features) {
    const matched = rows.filter((row) => pick(row.metadata ?? {}))
    if (matched.length < MIN_GROUP_SIZE) continue
    const avg =
      matched.reduce(
        (sum, row) => sum + monthlyGallons(Number(row.waterUsedGallons), row.periodStart, row.periodEnd),
        0,
      ) / matched.length
    points.push({ group: label, use: Math.round(avg) })
  }
  return points
}

function indoorFeatureRows(rows: ContributionRow[]): ChartPoint[] {
  const features = [
    { label: 'Fridge dispenser', pick: (m: ContributionMetadata) => m.hasFridgeDispenser === true },
    { label: 'Mostly shower', pick: (m: ContributionMetadata) => isMostlyShower(m.bathroomPreference) },
    { label: 'Mostly tub', pick: (m: ContributionMetadata) => isMostlyTub(m.bathroomPreference) },
  ] as const

  const points: ChartPoint[] = []
  for (const { label, pick } of features) {
    const matched = rows.filter((row) => pick(row.metadata ?? {}))
    if (matched.length < MIN_GROUP_SIZE) continue
    const avg =
      matched.reduce(
        (sum, row) => sum + monthlyGallons(Number(row.waterUsedGallons), row.periodStart, row.periodEnd),
        0,
      ) / matched.length
    points.push({ group: label, use: Math.round(avg) })
  }
  return points
}

function buildSummary(rows: ContributionRow[]): GroupedAnalytics['summary'] {
  if (rows.length < MIN_GROUP_SIZE) return null

  const withMeta = rows.filter((row) => row.metadata && Object.keys(row.metadata).length > 0)
  if (withMeta.length < MIN_GROUP_SIZE) return null

  const poolCount = withMeta.filter((row) => row.metadata?.hasPool).length
  const sprinklerCount = withMeta.filter((row) => row.metadata?.hasSprinklers).length
  const gardenCount = withMeta.filter((row) => row.metadata?.hasGarden).length
  const fridgeCount = withMeta.filter((row) => row.metadata?.hasFridgeDispenser).length
  const showerCount = withMeta.filter((row) => isMostlyShower(row.metadata?.bathroomPreference)).length
  const ownerCount = withMeta.filter((row) => isOwnerOccupied(row.metadata?.ownership)).length

  const householdCounts = new Map<string, number>()
  const homeTypeCounts = new Map<string, number>()
  const lotCounts = new Map<string, number>()
  for (const row of withMeta) {
    const size = normalizeHouseholdSize(row.metadata?.householdSize)
    if (size) householdCounts.set(size, (householdCounts.get(size) ?? 0) + 1)
    const homeType = row.metadata?.propertyType
    if (homeType) homeTypeCounts.set(homeType, (homeTypeCounts.get(homeType) ?? 0) + 1)
    const lot = row.metadata?.lotSize
    if (lot) lotCounts.set(lotSizeLabel(lot), (lotCounts.get(lotSizeLabel(lot)) ?? 0) + 1)
  }

  const topHousehold = [...householdCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const topHomeType = [...homeTypeCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  const topLot = [...lotCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null

  const avgBill =
    rows.reduce((sum, row) => sum + monthlyBillDollars(row.billCostCents, row.periodStart, row.periodEnd), 0) /
    rows.length

  const sorted = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const midpoint = Math.floor(sorted.length / 2)
  const earlier = sorted.slice(0, midpoint)
  const later = sorted.slice(midpoint)
  let change: string | null = null
  if (earlier.length >= MIN_GROUP_SIZE && later.length >= MIN_GROUP_SIZE) {
    const earlierAvg =
      earlier.reduce(
        (sum, row) => sum + monthlyGallons(Number(row.waterUsedGallons), row.periodStart, row.periodEnd),
        0,
      ) / earlier.length
    const laterAvg =
      later.reduce(
        (sum, row) => sum + monthlyGallons(Number(row.waterUsedGallons), row.periodStart, row.periodEnd),
        0,
      ) / later.length
    if (earlierAvg > 0) {
      const pct = ((laterAvg - earlierAvg) / earlierAvg) * 100
      change = `${pct > 0 ? '+' : ''}${Math.round(pct)}%`
    }
  }

  return {
    poolShare: Math.round((poolCount / withMeta.length) * 100),
    averageHousehold: topHousehold,
    ownerShare: Math.round((ownerCount / withMeta.length) * 100),
    typicalLotSize: topLot,
    sprinklerShare: Math.round((sprinklerCount / withMeta.length) * 100),
    gardenShare: Math.round((gardenCount / withMeta.length) * 100),
    fridgeDispenserShare: Math.round((fridgeCount / withMeta.length) * 100),
    showerShare: Math.round((showerCount / withMeta.length) * 100),
    commonHomeType: topHomeType,
    averageMonthlyBill: `$${avgBill.toFixed(0)}/mo`,
    change,
  }
}

export async function buildContributionAnalytics(stateId: number): Promise<GroupedAnalytics | null> {
  const rows = await db
    .select({
      waterUsedGallons: contributions.waterUsedGallons,
      billCostCents: contributions.billCostCents,
      periodStart: contributions.periodStart,
      periodEnd: contributions.periodEnd,
      metadata: contributions.metadata,
      createdAt: contributions.createdAt,
    })
    .from(contributions)
    .where(eq(contributions.stateId, stateId))

  if (rows.length < MIN_GROUP_SIZE) return null

  const typedRows: ContributionRow[] = rows.map((row) => ({
    ...row,
    metadata: (row.metadata as ContributionMetadata | null) ?? null,
  }))

  const analytics: GroupedAnalytics = {
    monthlyTrend: groupChartPoints(typedRows, (row) => monthLabel(row.periodEnd)),
    homeTypes: groupChartPoints(typedRows, (row) => row.metadata?.propertyType ?? null),
    householdSizes: groupChartPoints(typedRows, (row) => normalizeHouseholdSize(row.metadata?.householdSize)),
    seasons: groupChartPoints(typedRows, (row) => seasonFromDate(row.periodEnd)),
    ownership: groupChartPoints(typedRows, (row) => normalizeOwnershipLabel(row.metadata?.ownership)),
    lotSizes: groupChartPoints(typedRows, (row) => {
      const lot = row.metadata?.lotSize
      return lot ? lotSizeLabel(lot) : null
    }),
    outdoorFeatures: outdoorFeatureRows(typedRows),
    indoorFeatures: indoorFeatureRows(typedRows),
    summary: buildSummary(typedRows),
  }

  const hasAnyChart = [
    analytics.monthlyTrend,
    analytics.homeTypes,
    analytics.householdSizes,
    analytics.seasons,
    analytics.ownership,
    analytics.lotSizes,
    analytics.outdoorFeatures,
    analytics.indoorFeatures,
  ].some((series) => series.length > 0)

  if (!hasAnyChart && !analytics.summary) return null
  return analytics
}
