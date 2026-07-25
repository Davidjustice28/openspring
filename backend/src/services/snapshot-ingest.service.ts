import { US_STATES } from '@openspring/shared'
import { db } from '../db/index.js'
import { states, waterData } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { fetchRestrictionCities, fetchCityRestriction } from './city-restrictions.service.js'
import { fetchWaterLegislation } from './open-states.service.js'
import { fetchWaterRightsSummary } from './water-rights.service.js'
import { fetchFarmAgSummary } from './farm-ag.service.js'
import { fetchWaterData, stressFromWater } from './water.service.js'
import { fetchOgcMetricsForSnapshot } from './ogc-water.service.js'
import { fetchNotableWaterHighlightsForSnapshot } from './notable-water.service.js'
import { mapWithConcurrency } from '../lib/concurrency.js'
import {
  recordCityRestrictionSnapshot,
  recordLegislationSnapshots,
  recordMetricSnapshotBatch,
  resolveStateIdByFips,
  stateEntityKey,
  type MetricSnapshotInput,
} from './snapshot.service.js'
import { backfillStateProfilesIfDue } from './state-backfill.service.js'

export interface SnapshotIngestResult {
  statesProcessed: number
  metricsRecorded: number
  restrictionsRecorded: number
  legislationRecorded: number
  profilesBackfilled: number
  errors: string[]
}

function envMetricsToSnapshots(
  stateId: number,
  fips: string,
  metrics: Awaited<ReturnType<typeof fetchOgcMetricsForSnapshot>>,
  observedAt: Date,
): MetricSnapshotInput[] {
  const entityKey = stateEntityKey(fips)
  const entries: { key: string; value: number | null; unit?: string }[] = [
    { key: 'gage_height_ft', value: metrics.gageHeightFt, unit: 'ft' },
    { key: 'discharge_cfs', value: metrics.dischargeCfs, unit: 'cfs' },
    { key: 'water_temp_f', value: metrics.waterTempF, unit: 'F' },
    { key: 'conductance', value: metrics.conductance, unit: 'uS/cm' },
    { key: 'active_stations', value: metrics.activeStations, unit: 'count' },
    { key: 'flow_trend_pct', value: metrics.flowTrendPct, unit: 'percent' },
    { key: 'recent_rain_in', value: metrics.recentRainIn, unit: 'in' },
    { key: 'lake_gage_height_ft', value: metrics.lakeGageHeightFt, unit: 'ft' },
    { key: 'lake_site_count', value: metrics.lakeSiteCount, unit: 'count' },
    { key: 'lake_level_trend_pct', value: metrics.lakeLevelTrendPct, unit: 'percent' },
    { key: 'lake_level_vs_typical_pct', value: metrics.lakeLevelVsTypicalPct, unit: 'percent' },
  ]

  return entries
    .filter((entry) => entry.value != null)
    .map((entry) => ({
      stateId,
      source: 'usgs-ogc',
      metricKey: entry.key,
      entityKey,
      entityLabel: US_STATES.find((s) => s.fips === fips)?.name ?? fips,
      valueNumeric: entry.value,
      unit: entry.unit ?? null,
      observedAt,
    }))
}

export async function ingestStateSnapshots(fips: string, abbreviation: string, slug: string, name: string): Promise<{
  metrics: number
  restrictions: number
  legislation: number
}> {
  const stateId = await resolveStateIdByFips(fips)
  if (!stateId) return { metrics: 0, restrictions: 0, legislation: 0 }

  const info = US_STATES.find((s) => s.fips === fips)
  if (!info) return { metrics: 0, restrictions: 0, legislation: 0 }

  const [lat, lng] = [info.coordinates[1], info.coordinates[0]]
  const observedAt = new Date()
  let metricsRecorded = 0
  let restrictionsRecorded = 0
  let legislationRecorded = 0

  const [water, farmAg, envMetrics, notableMetrics, legislation, waterRights] = await Promise.all([
    fetchWaterData(abbreviation).catch(() => null),
    fetchFarmAgSummary(abbreviation).catch(() => null),
    fetchOgcMetricsForSnapshot(fips, lat, lng).catch(() => null),
    fetchNotableWaterHighlightsForSnapshot(fips).catch(() => []),
    fetchWaterLegislation(name).catch(() => []),
    fetchWaterRightsSummary(fips).catch(() => null),
  ])

  const metricInputs: MetricSnapshotInput[] = []

  if (water) {
    const entityKey = stateEntityKey(fips)
    if (water.availability != null) {
      metricInputs.push({
        stateId,
        source: 'nwdc',
        metricKey: 'availability',
        entityKey,
        entityLabel: name,
        valueNumeric: water.availability,
        unit: 'index',
        observedAt,
      })
    }
    if (water.consumption != null) {
      metricInputs.push({
        stateId,
        source: 'nwdc',
        metricKey: 'consumption',
        entityKey,
        entityLabel: name,
        valueNumeric: water.consumption,
        unit: 'mm/month',
        observedAt,
      })
    }
    const stress = stressFromWater(water.availability, water.consumption)
    metricInputs.push({
      stateId,
      source: 'derived',
      metricKey: 'stress_level',
      entityKey,
      entityLabel: name,
      valueText: stress,
      observedAt,
    })

    await db.insert(waterData).values({
      stateId,
      metrics: { availability: water.availability, consumption: water.consumption, stress },
      trends: water.trends,
      source: 'nwdc',
    })
  }

  if (farmAg) {
    const entityKey = stateEntityKey(fips)
    const farmEntries: { key: string; value: number | null; unit: string }[] = [
      { key: 'irrigation_mgd', value: farmAg.irrigationWithdrawalMgd, unit: 'MGD' },
      { key: 'irrigation_groundwater_mgd', value: farmAg.irrigationGroundwaterMgd, unit: 'MGD' },
      { key: 'irrigation_surface_mgd', value: farmAg.irrigationSurfaceMgd, unit: 'MGD' },
      { key: 'public_supply_mgd', value: farmAg.publicSupplyMgd, unit: 'MGD' },
      { key: 'irrigated_acres', value: farmAg.irrigatedAcres, unit: 'acres' },
    ]
    for (const entry of farmEntries) {
      if (entry.value == null) continue
      metricInputs.push({
        stateId,
        source: 'nwdc',
        metricKey: entry.key,
        entityKey,
        entityLabel: name,
        valueNumeric: entry.value,
        unit: entry.unit,
        observedAt,
        payload: { sourceYear: farmAg.sourceYear },
      })
    }
  }

  if (envMetrics) {
    metricInputs.push(...envMetricsToSnapshots(stateId, fips, envMetrics, observedAt))
  }

  metricInputs.push(...notableMetrics)

  if (waterRights?.totalRecords != null) {
    metricInputs.push({
      stateId,
      source: 'water-rights',
      metricKey: 'total_records',
      entityKey: stateEntityKey(fips),
      entityLabel: name,
      valueNumeric: waterRights.totalRecords,
      unit: 'count',
      observedAt,
    })
  }

  metricsRecorded = await recordMetricSnapshotBatch(metricInputs)

  const cities = await fetchRestrictionCities(slug).catch(() => [])
  for (const city of cities) {
    const restriction = await fetchCityRestriction(slug, city.slug).catch(() => null)
    if (!restriction) continue
    const recorded = await recordCityRestrictionSnapshot(stateId, restriction, { skipIfUnchanged: true })
    if (recorded) restrictionsRecorded += 1
  }

  legislationRecorded = await recordLegislationSnapshots(stateId, legislation)

  return { metrics: metricsRecorded, restrictions: restrictionsRecorded, legislation: legislationRecorded }
}

export async function ingestAllStateSnapshots(concurrency = 3): Promise<SnapshotIngestResult> {
  const result: SnapshotIngestResult = {
    statesProcessed: 0,
    metricsRecorded: 0,
    restrictionsRecorded: 0,
    legislationRecorded: 0,
    profilesBackfilled: 0,
    errors: [],
  }

  const dbStates = await db.select().from(states)
  const stateByFips = new Map(dbStates.map((row) => [row.fipsCode, row]))

  await mapWithConcurrency(US_STATES, concurrency, async (state) => {
    const dbState = stateByFips.get(state.fips)
    if (!dbState) {
      result.errors.push(`Missing DB state row for ${state.name}`)
      return
    }

    try {
      const ingest = await ingestStateSnapshots(state.fips, state.abbreviation, state.slug, state.name)
      result.statesProcessed += 1
      result.metricsRecorded += ingest.metrics
      result.restrictionsRecorded += ingest.restrictions
      result.legislationRecorded += ingest.legislation
    } catch (error) {
      result.errors.push(`${state.name}: ${error instanceof Error ? error.message : String(error)}`)
    }
  })

  try {
    result.profilesBackfilled = await backfillStateProfilesIfDue()
  } catch (error) {
    result.errors.push(`Profile backfill: ${error instanceof Error ? error.message : String(error)}`)
  }

  return result
}
