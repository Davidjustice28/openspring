import { CACHE_TTL } from '@openspring/shared'
import type { EnvMetric, NotableWaterBody, NotableWaterKind } from '@openspring/shared'
import { NOTABLE_WATER_BODIES_BY_FIPS } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'
import { mapWithConcurrency } from '../lib/concurrency.js'
import {
  recordMetricSnapshot,
  resolveStateIdByFips,
  siteEntityKey,
  type MetricSnapshotInput,
} from './snapshot.service.js'

const OGC_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0'

const LAKE_PARAMETER_CODES = ['62614', '62615', '00065', '00062'] as const
const RIVER_PARAMETER_CODES = ['00060', '00065', '00010'] as const

interface OgcFeature {
  properties?: {
    value?: string | number | null
    parameter_code?: string
    unit_of_measure?: string
    time?: string
  }
}

interface OgcFeatureCollection {
  features?: OgcFeature[]
}

interface ParsedReading {
  parameterCode: string
  value: number
  unit: string
  time: string | null
}

function clampProgress(value: number, low: number, high: number): number {
  if (high <= low) return 50
  return Math.round(Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)))
}

function formatNumber(value: number): string {
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US')
  if (Math.abs(value) >= 100) return Math.round(value).toLocaleString('en-US')
  return (Math.round(value * 10) / 10).toLocaleString('en-US')
}

function formatReading(parameterCode: string, value: number, unit: string): string {
  if (parameterCode === '00060') {
    return value >= 1000 ? `${formatNumber(value / 1000)}k cfs` : `${formatNumber(value)} cfs`
  }
  if (parameterCode === '00010') return `${formatNumber(value)}°C`
  if (parameterCode === '00062') return `${formatNumber(value)} acre-ft stored`
  if (unit.toLowerCase().includes('ft')) return `${formatNumber(value)} ft`
  return `${formatNumber(value)} ${unit}`.trim()
}

async function ogcGet(url: string): Promise<OgcFeatureCollection> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`USGS OGC API error: ${res.status}`)
  return (await res.json()) as OgcFeatureCollection
}

function buildOgcUrl(path: string, params: Record<string, string>): string {
  const url = new URL(`${OGC_BASE}${path}`)
  url.searchParams.set('f', 'json')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  if (env.usgsApiKey) url.searchParams.set('api_key', env.usgsApiKey)
  return url.toString()
}

async function fetchLatestFeatures(siteId: string): Promise<OgcFeature[]> {
  const url = buildOgcUrl('/collections/latest-continuous/items', {
    monitoring_location_id: siteId,
    limit: '100',
  })
  const data = await ogcGet(url)
  return data.features ?? []
}

async function fetchDailyFeatures(siteId: string, parameterCode: string, days: number): Promise<OgcFeature[]> {
  const end = new Date()
  end.setDate(end.getDate() - 1)
  const start = new Date(end)
  start.setDate(start.getDate() - days)
  const url = buildOgcUrl('/collections/daily/items', {
    monitoring_location_id: siteId,
    parameter_code: parameterCode,
    statistic_id: '00003',
    datetime: `${start.toISOString().slice(0, 10)}/${end.toISOString().slice(0, 10)}`,
    limit: '200',
  })
  const data = await ogcGet(url)
  return data.features ?? []
}

function parseFeatures(features: OgcFeature[]): ParsedReading[] {
  return features
    .map((feature) => {
      const value = Number(feature.properties?.value)
      const parameterCode = feature.properties?.parameter_code ?? ''
      const unit = feature.properties?.unit_of_measure ?? ''
      const time = feature.properties?.time ?? null
      if (!parameterCode || !Number.isFinite(value)) return null
      return { parameterCode, value, unit, time }
    })
    .filter((reading): reading is ParsedReading => reading != null)
}

function pickReading(readings: ParsedReading[], kind: NotableWaterKind): ParsedReading | null {
  const priority = kind === 'lake' ? LAKE_PARAMETER_CODES : RIVER_PARAMETER_CODES
  for (const code of priority) {
    const match = readings.find((reading) => reading.parameterCode === code)
    if (match) return match
  }
  return readings[0] ?? null
}

function scaleFromHistory(values: number[]): { low: string; average: string; high: string; progress: number } {
  if (!values.length) {
    return { low: 'Low', average: 'Typical', high: 'High', progress: 50 }
  }
  const sorted = [...values].sort((a, b) => a - b)
  const low = sorted[0]!
  const high = sorted[sorted.length - 1]!
  const average = values.reduce((sum, value) => sum + value, 0) / values.length
  const current = values[values.length - 1]!
  return {
    low: formatNumber(low),
    average: formatNumber(average),
    high: formatNumber(high),
    progress: clampProgress(current, low, high),
  }
}

function measurementLabel(parameterCode: string, kind: NotableWaterKind): string {
  if (parameterCode === '00060') return 'River flow'
  if (parameterCode === '00010') return 'Water temperature'
  if (parameterCode === '00062') return 'Storage volume'
  if (parameterCode === '62614' || parameterCode === '62615') return 'Lake elevation'
  if (parameterCode === '00065') return kind === 'lake' ? 'Water level' : 'Gage height'
  return kind === 'lake' ? 'Water level' : 'River flow'
}

function buildHighlightMetric(body: NotableWaterBody, reading: ParsedReading, history: number[]): EnvMetric {
  const scale = scaleFromHistory(history.length ? history : [reading.value])
  const value = formatReading(reading.parameterCode, reading.value, reading.unit)
  const measurement = measurementLabel(reading.parameterCode, body.kind)

  const isLake = body.kind === 'lake'
  return {
    label: body.displayName,
    description: isLake
      ? `Water level at ${body.displayName}, reported in feet from a USGS lake or reservoir gauge.`
      : `River flow at ${body.displayName}, reported in cubic feet per second (cfs) from a USGS stream gauge.`,
    value,
    valueDetail: null,
    low: scale.low,
    average: scale.average,
    high: scale.high,
    lowLabel: 'Lower',
    averageLabel: 'Typical',
    highLabel: 'Higher',
    progress: scale.progress,
    tone: isLake ? 'text-[#0284c7]' : 'text-blue-600',
    isNamedHighlight: true,
    highlightKind: body.kind,
    highlightMeasurement: measurement,
    highlightReading: reading.value,
  }
}

function metricKeyForReading(parameterCode: string, kind: NotableWaterKind): string {
  if (parameterCode === '00060' || kind === 'river') return 'discharge_cfs'
  return 'water_level'
}

function unitForReading(parameterCode: string, unit: string): string {
  if (parameterCode === '00060') return 'cfs'
  if (unit.toLowerCase().includes('ft')) return 'ft'
  return unit
}

function buildSnapshotInput(
  fips: string,
  stateId: number | null,
  body: NotableWaterBody,
  reading: ParsedReading,
): MetricSnapshotInput {
  return {
    stateId,
    source: 'usgs-ogc',
    metricKey: metricKeyForReading(reading.parameterCode, body.kind),
    entityKey: siteEntityKey(body.monitoringLocationId),
    entityLabel: body.displayName,
    valueNumeric: reading.value,
    unit: unitForReading(reading.parameterCode, reading.unit),
    observedAt: reading.time ? new Date(reading.time) : new Date(),
    payload: {
      kind: body.kind,
      parameterCode: reading.parameterCode,
      monitoringLocationId: body.monitoringLocationId,
    },
  }
}

async function buildHighlightForSite(
  body: NotableWaterBody,
  options?: { fips?: string; stateId?: number | null; recordSnapshot?: boolean },
): Promise<EnvMetric | null> {
  const latestFeatures = await fetchLatestFeatures(body.monitoringLocationId).catch(() => [])
  const latestReadings = parseFeatures(latestFeatures)
  let reading = pickReading(latestReadings, body.kind)

  const parameterOrder = body.kind === 'lake' ? LAKE_PARAMETER_CODES : RIVER_PARAMETER_CODES
  if (!reading) {
    for (const parameterCode of parameterOrder) {
      const dailyFeatures = await fetchDailyFeatures(body.monitoringLocationId, parameterCode, 30).catch(() => [])
      const dailyReadings = parseFeatures(dailyFeatures)
      if (!dailyReadings.length) continue
      const sorted = dailyReadings.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      reading = sorted[sorted.length - 1]!
      break
    }
  }

  if (!reading) return null

  const historyFeatures = await fetchDailyFeatures(body.monitoringLocationId, reading.parameterCode, 90).catch(() => [])
  const history = parseFeatures(historyFeatures)
    .sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
    .map((entry) => entry.value)

  if (options?.recordSnapshot !== false) {
    const stateId = options?.stateId ?? (options?.fips ? await resolveStateIdByFips(options.fips) : null)
    void recordMetricSnapshot(buildSnapshotInput(options?.fips ?? '', stateId, body, reading)).catch(() => {})
  }

  return buildHighlightMetric(body, reading, history.length ? history : [reading.value])
}

export async function fetchNotableWaterHighlightsForSnapshot(fips: string): Promise<MetricSnapshotInput[]> {
  const sites = NOTABLE_WATER_BODIES_BY_FIPS[fips]
  if (!sites?.length) return []

  const stateId = await resolveStateIdByFips(fips)
  const snapshots: MetricSnapshotInput[] = []

  for (const site of sites) {
    const latestFeatures = await fetchLatestFeatures(site.monitoringLocationId).catch(() => [])
    const latestReadings = parseFeatures(latestFeatures)
    let reading = pickReading(latestReadings, site.kind)

    const parameterOrder = site.kind === 'lake' ? LAKE_PARAMETER_CODES : RIVER_PARAMETER_CODES
    if (!reading) {
      for (const parameterCode of parameterOrder) {
        const dailyFeatures = await fetchDailyFeatures(site.monitoringLocationId, parameterCode, 30).catch(() => [])
        const dailyReadings = parseFeatures(dailyFeatures)
        if (!dailyReadings.length) continue
        const sorted = dailyReadings.sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
        reading = sorted[sorted.length - 1]!
        break
      }
    }

    if (!reading) continue
    snapshots.push(buildSnapshotInput(fips, stateId, site, reading))
  }

  return snapshots
}

export async function fetchNotableWaterHighlights(fips: string): Promise<EnvMetric[]> {
  const sites = NOTABLE_WATER_BODIES_BY_FIPS[fips]
  if (!sites?.length) return []

  const cacheKey = `ogc:notable:v4:${fips}:${new Date().toISOString().slice(0, 10)}`
  const cached = await getCached<EnvMetric[]>(cacheKey)
  if (cached) return cached

  const stateId = await resolveStateIdByFips(fips)

  const cards = (
    await mapWithConcurrency(sites, 4, async (site) => {
      try {
        return await buildHighlightForSite(site, { fips, stateId, recordSnapshot: true })
      } catch {
        return null
      }
    })
  ).filter((card): card is EnvMetric => card != null)

  await setCache(cacheKey, `ogc:notable:${fips}`, cards, CACHE_TTL.usgsOgc)
  return cards
}
