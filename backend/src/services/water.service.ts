import { CACHE_TTL, STATE_BY_ABBR } from '@openspring/shared'
import type { StressLevel } from '@openspring/shared'
import { getCached, setCache } from './cache.service.js'
import {
  recordMetricSnapshots,
  resolveStateIdByFips,
  stateEntityKey,
  type MetricSnapshotInput,
} from './snapshot.service.js'

export interface WaterMetrics {
  availability: number | null
  consumption: number | null
  trends: { year: string; availability: number | null; consumption: number | null }[]
}

interface NwdcYearRow {
  year?: string
  availab?: number
  consum?: number
}

interface NwdcResponse {
  data?: Record<string, NwdcYearRow[]>
  metadata?: { links?: { rel?: string; href?: string }[] }
}

const NWDC_START = '2010'
const NWDC_END = '2019'

async function fetchNwdcStateRows(abbreviation: string): Promise<NwdcYearRow[][]> {
  let url: string | null =
    `https://api.water.usgs.gov/nwaa-data/data?model=iwa-assessment-outputs-conus-2025&variable=availab,consum&location=stateCd:${abbreviation}&timeRes=annualcy&startDate=${NWDC_START}&endDate=${NWDC_END}&format=json&limit=600`
  const hucSeries: NwdcYearRow[][] = []

  while (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
    if (!res.ok) return []
    const payload = (await res.json()) as NwdcResponse
    const hucBlocks = payload.data ?? {}
    for (const rows of Object.values(hucBlocks)) {
      if (rows.length) hucSeries.push(rows)
    }
    url = payload.metadata?.links?.find((link) => link.rel === 'next')?.href ?? null
  }

  return hucSeries
}

function aggregateStateTrends(hucSeries: NwdcYearRow[][]): WaterMetrics['trends'] {
  const yearBuckets = new Map<string, { avail: number[]; consum: number[] }>()

  for (const series of hucSeries) {
    for (const row of series) {
      const year = row.year?.slice(0, 4)
      if (!year) continue
      if (!yearBuckets.has(year)) yearBuckets.set(year, { avail: [], consum: [] })
      const bucket = yearBuckets.get(year)!
      if (row.availab != null) bucket.avail.push(row.availab)
      if (row.consum != null) bucket.consum.push(row.consum)
    }
  }

  return [...yearBuckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([year, bucket]) => ({
      year,
      availability: bucket.avail.length ? bucket.avail.reduce((a, b) => a + b, 0) / bucket.avail.length : null,
      consumption: bucket.consum.length ? bucket.consum.reduce((a, b) => a + b, 0) / bucket.consum.length : null,
    }))
}

export async function fetchWaterData(abbreviation: string): Promise<WaterMetrics> {
  const cacheKey = `water:state:${abbreviation}:${NWDC_START}-${NWDC_END}`
  const cached = await getCached<WaterMetrics>(cacheKey)
  if (cached) return cached

  const hucSeries = await fetchNwdcStateRows(abbreviation)
  const trends = aggregateStateTrends(hucSeries)
  const latest = trends[trends.length - 1]
  const result = {
    availability: latest?.availability ?? null,
    consumption: latest?.consumption ?? null,
    trends,
  }
  await setCache(cacheKey, `nwdc:stateCd:${abbreviation}`, result, CACHE_TTL.water)
  void recordWaterMetricSnapshots(abbreviation, result).catch(() => {})
  return result
}

async function recordWaterMetricSnapshots(abbreviation: string, water: WaterMetrics): Promise<void> {
  const info = STATE_BY_ABBR[abbreviation]
  if (!info) return

  const stateId = await resolveStateIdByFips(info.fips)
  const entityKey = stateEntityKey(info.fips)
  const observedAt = new Date()
  const snapshots: MetricSnapshotInput[] = []

  if (water.availability != null) {
    snapshots.push({
      stateId,
      source: 'nwdc',
      metricKey: 'availability',
      entityKey,
      entityLabel: info.name,
      valueNumeric: water.availability,
      unit: 'index',
      observedAt,
    })
  }

  if (water.consumption != null) {
    snapshots.push({
      stateId,
      source: 'nwdc',
      metricKey: 'consumption',
      entityKey,
      entityLabel: info.name,
      valueNumeric: water.consumption,
      unit: 'mm/month',
      observedAt,
    })
  }

  snapshots.push({
    stateId,
    source: 'derived',
    metricKey: 'stress_level',
    entityKey,
    entityLabel: info.name,
    valueText: stressFromWater(water.availability, water.consumption),
    observedAt,
  })

  recordMetricSnapshots(snapshots)
}

export function stressFromWater(availability: number | null, consumption: number | null): StressLevel {
  if (availability == null && consumption == null) return 'More data needed'
  const avail = availability ?? 50
  const consum = consumption ?? 50
  const score = avail - consum
  if (score < -20) return 'Needs attention'
  if (score < 0) return 'Watch'
  if (score < 15) return 'Stable'
  return 'Excellent'
}
