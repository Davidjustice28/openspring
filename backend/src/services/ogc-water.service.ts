import { CACHE_TTL } from '@openspring/shared'
import type { EnvMetric } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'
import { fetchNotableWaterHighlights } from './notable-water.service.js'
import {
  recordMetricSnapshots,
  resolveStateIdByFips,
  stateEntityKey,
  type MetricSnapshotInput,
} from './snapshot.service.js'

const OGC_BASE = 'https://api.waterdata.usgs.gov/ogcapi/v0'

interface OgcFeature {
  properties?: {
    value?: string | number | null
    monitoring_location_id?: string
    time?: string
  }
}

interface OgcFeatureCollection {
  features?: OgcFeature[]
  links?: { rel?: string; href?: string }[]
}

interface OgcEnvironmentalMetrics {
  gageHeightFt: number | null
  dischargeCfs: number | null
  waterTempF: number | null
  conductance: number | null
  activeStations: number | null
  flowTrendPct: number | null
  recentRainIn: number | null
  lakeGageHeightFt: number | null
  lakeSiteCount: number | null
  lakeLevelTrendPct: number | null
  lakeLevelVsTypicalPct: number | null
}

function clampProgress(value: number, low: number, high: number): number {
  if (high <= low) return 50
  return Math.round(Math.min(100, Math.max(0, ((value - low) / (high - low)) * 100)))
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / values.length
}

function parseNumericValues(features: OgcFeature[]): number[] {
  return features
    .map((f) => f.properties?.value)
    .filter((v): v is string | number => v != null && v !== '')
    .map(Number)
    .filter((n) => Number.isFinite(n))
}

function formatFeet(n: number): string {
  return `${n.toFixed(1)} ft`
}

function formatTempF(n: number): string {
  return `${Math.round(n)}°F`
}

function formatInches(n: number): string {
  return `${n.toFixed(1)} in`
}

function formatTrendPct(n: number): string {
  const sign = n > 0 ? '+' : ''
  return `${sign}${Math.round(n)}%`
}

function formatConductance(n: number): string {
  return `${Math.round(n).toLocaleString('en-US')} µS/cm`
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

async function fetchAllOgcFeatures(path: string, params: Record<string, string>, maxPages = 15): Promise<OgcFeature[]> {
  let url = buildOgcUrl(path, params)
  const features: OgcFeature[] = []

  for (let page = 0; page < maxPages; page++) {
    const data = await ogcGet(url)
    features.push(...(data.features ?? []))
    const next = data.links?.find((link) => link.rel === 'next')?.href
    if (!next) break
    url = next
  }

  return features
}

async function fetchRecentPrecipitationInches(lat: number, lng: number): Promise<number | null> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&past_days=7&daily=precipitation_sum&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { daily?: { precipitation_sum?: (number | null)[] } }
  const values = (data.daily?.precipitation_sum ?? []).filter((v): v is number => v != null)
  if (!values.length) return null
  return values.reduce((a, b) => a + b, 0) / 25.4
}

function medianPercentDeviation(latestBySite: Map<string, number>, historyBySite: Map<string, number[]>): number | null {
  const deviations: number[] = []
  for (const [siteId, latest] of latestBySite) {
    const history = historyBySite.get(siteId)
    if (!history || history.length < 5 || !Number.isFinite(latest)) continue
    const average = history.reduce((a, b) => a + b, 0) / history.length
    if (average <= 0) continue
    deviations.push(((latest - average) / average) * 100)
  }
  return median(deviations)
}

function latestValuesBySite(features: OgcFeature[]): Map<string, number> {
  const bySite = new Map<string, number>()
  for (const feature of features) {
    const siteId = feature.properties?.monitoring_location_id
    const value = Number(feature.properties?.value)
    if (!siteId || !Number.isFinite(value)) continue
    bySite.set(siteId, value)
  }
  return bySite
}

function dailyValuesBySite(features: OgcFeature[]): Map<string, number[]> {
  const bySite = new Map<string, number[]>()
  for (const feature of features) {
    const siteId = feature.properties?.monitoring_location_id
    const value = Number(feature.properties?.value)
    if (!siteId || !Number.isFinite(value)) continue
    if (!bySite.has(siteId)) bySite.set(siteId, [])
    bySite.get(siteId)!.push(value)
  }
  return bySite
}

function weekTrendFromDaily(features: OgcFeature[], recentCutoff: string, priorCutoff: string, priorStartStr: string): number | null {
  const recentValues: number[] = []
  const priorValues: number[] = []
  for (const feature of features) {
    const time = feature.properties?.time?.slice(0, 10)
    const value = Number(feature.properties?.value)
    if (!time || !Number.isFinite(value)) continue
    if (time >= recentCutoff) recentValues.push(value)
    else if (time <= priorCutoff && time >= priorStartStr) priorValues.push(value)
  }
  const recentAvg = mean(recentValues)
  const priorAvg = mean(priorValues)
  return recentAvg != null && priorAvg != null && priorAvg > 0 ? ((recentAvg - priorAvg) / priorAvg) * 100 : null
}

async function fetchOgcMetrics(fips: string, lat: number, lng: number): Promise<OgcEnvironmentalMetrics> {
  const cacheKey = `ogc:env:v2:${fips}:${new Date().toISOString().slice(0, 10)}`
  const cached = await getCached<OgcEnvironmentalMetrics>(cacheKey)
  if (cached) return cached

  const end = new Date()
  end.setDate(end.getDate() - 1)
  const endStr = end.toISOString().slice(0, 10)
  const recentStart = new Date(end)
  recentStart.setDate(recentStart.getDate() - 6)
  const priorStart = new Date(end)
  priorStart.setDate(priorStart.getDate() - 13)
  const priorEnd = new Date(end)
  priorEnd.setDate(priorEnd.getDate() - 7)
  const trendRange = `${priorStart.toISOString().slice(0, 10)}/${endStr}`
  const historyStart = new Date(end)
  historyStart.setDate(historyStart.getDate() - 30)
  const historyRange = `${historyStart.toISOString().slice(0, 10)}/${endStr}`

  const [
    latestRiverGage,
    latestDischarge,
    latestTemp,
    latestConductance,
    dailyDischarge,
    latestLakeGage,
    latestLakeElevation,
    dailyLakeElevation,
    historyLakeElevation,
    recentRainIn,
  ] = await Promise.all([
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'ST',
      parameter_code: '00065',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'ST',
      parameter_code: '00060',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'ST',
      parameter_code: '00010',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'ST',
      parameter_code: '00095',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/daily/items', {
      state_code: fips,
      site_type_code: 'ST',
      parameter_code: '00060',
      statistic_id: '00003',
      datetime: trendRange,
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'LK',
      parameter_code: '00065',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/latest-continuous/items', {
      state_code: fips,
      site_type_code: 'LK',
      parameter_code: '62614',
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/daily/items', {
      state_code: fips,
      site_type_code: 'LK',
      parameter_code: '62614',
      statistic_id: '00003',
      datetime: trendRange,
      limit: '1000',
    }).catch(() => []),
    fetchAllOgcFeatures('/collections/daily/items', {
      state_code: fips,
      site_type_code: 'LK',
      parameter_code: '62614',
      statistic_id: '00003',
      datetime: historyRange,
      limit: '1000',
    }).catch(() => []),
    fetchRecentPrecipitationInches(lat, lng).catch(() => null),
  ])

  const tempC = mean(parseNumericValues(latestTemp))
  const stationIds = new Set<string>()
  for (const feature of [...latestRiverGage, ...latestDischarge, ...latestTemp, ...latestConductance, ...latestLakeGage, ...latestLakeElevation]) {
    const id = feature.properties?.monitoring_location_id
    if (id) stationIds.add(id)
  }

  const recentCutoff = recentStart.toISOString().slice(0, 10)
  const priorCutoff = priorEnd.toISOString().slice(0, 10)
  const priorStartStr = priorStart.toISOString().slice(0, 10)
  const flowTrendPct = weekTrendFromDaily(dailyDischarge, recentCutoff, priorCutoff, priorStartStr)

  const lakeSiteIds = new Set<string>()
  for (const feature of [...latestLakeGage, ...latestLakeElevation]) {
    const id = feature.properties?.monitoring_location_id
    if (id) lakeSiteIds.add(id)
  }

  const lakeLevelTrendPct = weekTrendFromDaily(dailyLakeElevation, recentCutoff, priorCutoff, priorStartStr)
  const lakeLevelVsTypicalPct = medianPercentDeviation(
    latestValuesBySite(latestLakeElevation),
    dailyValuesBySite(historyLakeElevation),
  )

  const result: OgcEnvironmentalMetrics = {
    gageHeightFt: median(parseNumericValues(latestRiverGage)),
    dischargeCfs: median(parseNumericValues(latestDischarge)),
    waterTempF: tempC != null ? (tempC * 9) / 5 + 32 : null,
    conductance: median(parseNumericValues(latestConductance)),
    activeStations: stationIds.size || null,
    flowTrendPct,
    recentRainIn,
    lakeGageHeightFt: median(parseNumericValues(latestLakeGage)),
    lakeSiteCount: lakeSiteIds.size || null,
    lakeLevelTrendPct,
    lakeLevelVsTypicalPct,
  }

  await setCache(cacheKey, `ogc:env:${fips}`, result, CACHE_TTL.usgsOgc)
  return result
}

export async function fetchOgcMetricsForSnapshot(fips: string, lat: number, lng: number): Promise<OgcEnvironmentalMetrics> {
  return fetchOgcMetrics(fips, lat, lng)
}

function ogcMetricsToSnapshots(stateId: number | null, fips: string, metrics: OgcEnvironmentalMetrics): MetricSnapshotInput[] {
  const entityKey = stateEntityKey(fips)
  const observedAt = new Date()
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
      valueNumeric: entry.value,
      unit: entry.unit ?? null,
      observedAt,
    }))
}

async function recordOgcMetricSnapshots(fips: string, metrics: OgcEnvironmentalMetrics): Promise<void> {
  const stateId = await resolveStateIdByFips(fips)
  recordMetricSnapshots(ogcMetricsToSnapshots(stateId, fips, metrics))
}

function buildMetric(
  label: string,
  description: string,
  value: string,
  low: string,
  average: string,
  high: string,
  progress: number,
  tone: string,
  options?: {
    valueDetail?: string | null
    lowLabel?: string
    averageLabel?: string
    highLabel?: string
  },
): EnvMetric {
  return {
    label,
    description,
    value,
    valueDetail: options?.valueDetail ?? null,
    low,
    average,
    high,
    lowLabel: options?.lowLabel,
    averageLabel: options?.averageLabel,
    highLabel: options?.highLabel,
    progress,
    tone,
  }
}

function riverLevelSummary(ft: number): { value: string; detail: string; progress: number } {
  if (ft < 1.5) {
    return { value: 'Low river levels', detail: `${formatFeet(ft)} at monitored sites`, progress: clampProgress(ft, 0, 8) }
  }
  if (ft < 4) {
    return { value: 'Typical river levels', detail: `${formatFeet(ft)} at monitored sites`, progress: clampProgress(ft, 0, 8) }
  }
  return { value: 'Elevated river levels', detail: `${formatFeet(ft)} at monitored sites`, progress: clampProgress(ft, 0, 8) }
}

function streamFlowSummary(cfs: number): { value: string; detail: string; progress: number } {
  const detail =
    cfs >= 1000 ? `${(cfs / 1000).toFixed(1)}k cubic feet per second` : `${Math.round(cfs).toLocaleString('en-US')} cubic feet per second`
  if (cfs < 300) return { value: 'Slow-moving rivers', detail, progress: clampProgress(cfs, 100, 3000) }
  if (cfs < 1500) return { value: 'Normal river flow', detail, progress: clampProgress(cfs, 100, 3000) }
  return { value: 'Fast-moving rivers', detail, progress: clampProgress(cfs, 100, 3000) }
}

function riverTemperatureSummary(tempF: number): { value: string; detail: string; progress: number } {
  if (tempF < 50) {
    return { value: 'Cool river water', detail: `${formatTempF(tempF)} on average`, progress: clampProgress(tempF, 45, 85) }
  }
  if (tempF < 70) {
    return { value: 'Moderate river water', detail: `${formatTempF(tempF)} on average`, progress: clampProgress(tempF, 45, 85) }
  }
  return { value: 'Warm river water', detail: `${formatTempF(tempF)} on average`, progress: clampProgress(tempF, 45, 85) }
}

function mineralIndicatorSummary(conductance: number): { value: string; detail: string; progress: number } {
  if (conductance < 400) {
    return {
      value: 'Lower dissolved minerals',
      detail: 'Often seen in cleaner freshwater sources',
      progress: clampProgress(conductance, 200, 2000),
    }
  }
  if (conductance < 1200) {
    return {
      value: 'Typical mineral levels',
      detail: `${formatConductance(conductance)} conductivity reading`,
      progress: clampProgress(conductance, 200, 2000),
    }
  }
  return {
    value: 'Higher dissolved minerals',
    detail: `${formatConductance(conductance)} conductivity reading`,
    progress: clampProgress(conductance, 200, 2000),
  }
}

function drySpellSummary(droughtScore: number): { value: string; detail: string; progress: number } {
  if (droughtScore < 25) {
    return { value: 'Wet conditions', detail: 'Regional supplies look relatively strong', progress: droughtScore }
  }
  if (droughtScore < 50) {
    return { value: 'Normal conditions', detail: 'Within a typical seasonal range', progress: droughtScore }
  }
  if (droughtScore < 75) {
    return { value: 'Dry conditions', detail: 'Regional supplies are tighter than average', progress: droughtScore }
  }
  return { value: 'Very dry conditions', detail: 'Regional supplies are under stress', progress: droughtScore }
}

function weeklyRainSummary(inches: number): { value: string; detail: string; progress: number } {
  if (inches < 0.25) {
    return { value: 'Mostly dry week', detail: `${formatInches(inches)} of rain near state center`, progress: clampProgress(inches, 0, 3) }
  }
  if (inches < 1.5) {
    return { value: 'Some rain this week', detail: `${formatInches(inches)} near state center`, progress: clampProgress(inches, 0, 3) }
  }
  return { value: 'Rainy week', detail: `${formatInches(inches)} near state center`, progress: clampProgress(inches, 0, 3) }
}

function flowChangeSummary(pct: number): { value: string; detail: string; progress: number } {
  if (pct <= -10) {
    return { value: 'Rivers slowing down', detail: `${formatTrendPct(pct)} compared with last week`, progress: clampProgress(pct, -20, 20) }
  }
  if (pct >= 10) {
    return { value: 'Rivers speeding up', detail: `${formatTrendPct(pct)} compared with last week`, progress: clampProgress(pct, -20, 20) }
  }
  return { value: 'Steady river flow', detail: `${formatTrendPct(pct)} compared with last week`, progress: clampProgress(pct, -20, 20) }
}

function lakeLevelChangeSummary(pct: number): { value: string; detail: string; progress: number } {
  if (pct <= -2) {
    return { value: 'Lakes falling', detail: `${formatTrendPct(pct)} surface elevation vs last week`, progress: clampProgress(pct, -15, 15) }
  }
  if (pct >= 2) {
    return { value: 'Lakes rising', detail: `${formatTrendPct(pct)} surface elevation vs last week`, progress: clampProgress(pct, -15, 15) }
  }
  return { value: 'Steady lake levels', detail: `${formatTrendPct(pct)} surface elevation vs last week`, progress: clampProgress(pct, -15, 15) }
}

function lakeReservoirLevelSummary(
  vsTypicalPct: number | null,
  gageFt: number | null,
  siteCount: number | null,
): { value: string; detail: string; progress: number } | null {
  const siteLabel =
    siteCount != null && siteCount > 0
      ? `${siteCount.toLocaleString('en-US')} monitored lakes and reservoirs`
      : 'Monitored lakes and reservoirs'

  if (vsTypicalPct != null) {
    if (vsTypicalPct <= -3) {
      return {
        value: 'Below typical lake levels',
        detail: `${formatTrendPct(vsTypicalPct)} vs the last 30 days at ${siteLabel}`,
        progress: clampProgress(vsTypicalPct, -15, 15),
      }
    }
    if (vsTypicalPct >= 3) {
      return {
        value: 'Above typical lake levels',
        detail: `${formatTrendPct(vsTypicalPct)} vs the last 30 days at ${siteLabel}`,
        progress: clampProgress(vsTypicalPct, -15, 15),
      }
    }
    return {
      value: 'Near typical lake levels',
      detail: `${formatTrendPct(vsTypicalPct)} vs the last 30 days at ${siteLabel}`,
      progress: clampProgress(vsTypicalPct, -15, 15),
    }
  }

  if (gageFt != null) {
    if (gageFt < 2) {
      return {
        value: 'Lower lake gage readings',
        detail: `${formatFeet(gageFt)} median gage height at ${siteLabel}`,
        progress: clampProgress(gageFt, 0, 12),
      }
    }
    if (gageFt < 6) {
      return {
        value: 'Typical lake gage readings',
        detail: `${formatFeet(gageFt)} median gage height at ${siteLabel}`,
        progress: clampProgress(gageFt, 0, 12),
      }
    }
    return {
      value: 'Higher lake gage readings',
      detail: `${formatFeet(gageFt)} median gage height at ${siteLabel}`,
      progress: clampProgress(gageFt, 0, 12),
    }
  }

  return null
}

function regionalUseSummary(consumption: number): { value: string; detail: string; progress: number } {
  const rounded = Math.round(consumption * 10) / 10
  if (consumption < 15) {
    return { value: 'Lower regional use', detail: `${rounded} mm/month modeled water use`, progress: clampProgress(consumption, 5, 45) }
  }
  if (consumption < 30) {
    return { value: 'Moderate regional use', detail: `${rounded} mm/month modeled water use`, progress: clampProgress(consumption, 5, 45) }
  }
  return { value: 'Higher regional use', detail: `${rounded} mm/month modeled water use`, progress: clampProgress(consumption, 5, 45) }
}

export async function fetchEnvironmentalSnapshot(
  fips: string,
  lat: number,
  lng: number,
  waterAvailability: number | null,
  waterConsumption: number | null,
): Promise<EnvMetric[]> {
  const metrics = await fetchOgcMetrics(fips, lat, lng)
  void recordOgcMetricSnapshots(fips, metrics)
  const cards: EnvMetric[] = []

  if (metrics.recentRainIn != null) {
    const rain = weeklyRainSummary(metrics.recentRainIn)
    cards.push(
      buildMetric(
        'Rain this week',
        'How much rain fell near the center of the state over the last 7 days. Recent rain can refill rivers, lakes, and soil moisture.',
        rain.value,
        '0 in',
        '1 in',
        '3 in',
        rain.progress,
        'text-[#0284c7]',
        {
          valueDetail: rain.detail,
          lowLabel: 'Dry',
          averageLabel: 'Typical',
          highLabel: 'Heavy',
        },
      ),
    )
  }

  if (waterAvailability != null) {
    const droughtScore = Math.round(Math.max(0, Math.min(100, 100 - waterAvailability)))
    const drySpell = drySpellSummary(droughtScore)
    cards.push(
      buildMetric(
        'Dry spell outlook',
        'A plain-language look at whether regional water supplies look wet, normal, or dry based on USGS water availability modeling.',
        drySpell.value,
        'Wet',
        'Normal',
        'Very dry',
        drySpell.progress,
        droughtScore >= 60 ? 'text-blue-800' : 'text-[#0284c7]',
        {
          valueDetail: drySpell.detail,
          lowLabel: 'Wet',
          averageLabel: 'Normal',
          highLabel: 'Dry',
        },
      ),
    )
  }

  if (metrics.flowTrendPct != null) {
    const trend = flowChangeSummary(metrics.flowTrendPct)
    cards.push(
      buildMetric(
        'River flow change',
        'Whether rivers are carrying more or less water than they were a week ago. Rising flow often follows rain or snowmelt.',
        trend.value,
        'Falling',
        'Steady',
        'Rising',
        trend.progress,
        'text-[#0284c7]',
        {
          valueDetail: trend.detail,
          lowLabel: 'Less water',
          averageLabel: 'About the same',
          highLabel: 'More water',
        },
      ),
    )
  }

  if (metrics.gageHeightFt != null) {
    const levels = riverLevelSummary(metrics.gageHeightFt)
    cards.push(
      buildMetric(
        'River levels',
        'How high rivers are running at USGS monitoring sites. Higher levels can mean more runoff and may warrant extra flood awareness in some areas.',
        levels.value,
        'Low',
        'Typical',
        'High',
        levels.progress,
        'text-[#0284c7]',
        {
          valueDetail: levels.detail,
          lowLabel: 'Low',
          averageLabel: 'Typical',
          highLabel: 'High',
        },
      ),
    )
  }

  if (metrics.dischargeCfs != null) {
    const flow = streamFlowSummary(metrics.dischargeCfs)
    cards.push(
      buildMetric(
        'How fast rivers are flowing',
        'How much water is moving through monitored rivers right now. Faster flow usually means recent rain, snowmelt, or upstream releases.',
        flow.value,
        'Slow',
        'Normal',
        'Fast',
        flow.progress,
        'text-[#0284c7]',
        {
          valueDetail: flow.detail,
          lowLabel: 'Slow',
          averageLabel: 'Normal',
          highLabel: 'Fast',
        },
      ),
    )
  }

  if (metrics.lakeLevelTrendPct != null) {
    const lakeTrend = lakeLevelChangeSummary(metrics.lakeLevelTrendPct)
    cards.push(
      buildMetric(
        'Lake & reservoir level change',
        'Whether monitored lakes and reservoirs are gaining or losing water compared with last week, based on USGS surface elevation readings.',
        lakeTrend.value,
        'Falling',
        'Steady',
        'Rising',
        lakeTrend.progress,
        'text-[#0284c7]',
        {
          valueDetail: lakeTrend.detail,
          lowLabel: 'Falling',
          averageLabel: 'Steady',
          highLabel: 'Rising',
        },
      ),
    )
  }

  const lakeLevels = lakeReservoirLevelSummary(
    metrics.lakeLevelVsTypicalPct,
    metrics.lakeGageHeightFt,
    metrics.lakeSiteCount,
  )
  if (lakeLevels) {
    cards.push(
      buildMetric(
        'Lake & reservoir levels',
        'How current lake and reservoir readings compare with recent weeks at USGS monitoring sites in this state, including major lakes and storage reservoirs.',
        lakeLevels.value,
        'Lower',
        'Typical',
        'Higher',
        lakeLevels.progress,
        'text-[#0284c7]',
        {
          valueDetail: lakeLevels.detail,
          lowLabel: 'Lower',
          averageLabel: 'Typical',
          highLabel: 'Higher',
        },
      ),
    )
  }

  if (metrics.waterTempF != null) {
    const temp = riverTemperatureSummary(metrics.waterTempF)
    cards.push(
      buildMetric(
        'River water temperature',
        'Surface-water temperature at monitoring locations. This affects fish, algae growth, and how water feels at lakes and rivers.',
        temp.value,
        'Cool',
        'Moderate',
        'Warm',
        temp.progress,
        'text-blue-600',
        {
          valueDetail: temp.detail,
          lowLabel: 'Cool',
          averageLabel: 'Moderate',
          highLabel: 'Warm',
        },
      ),
    )
  }

  if (waterConsumption != null) {
    const use = regionalUseSummary(waterConsumption)
    cards.push(
      buildMetric(
        'Regional water use',
        'Estimated monthly water use across the state from USGS regional modeling. Useful context for how much water communities and landscapes draw.',
        use.value,
        'Lower',
        'Moderate',
        'Higher',
        use.progress,
        'text-[#0284c7]',
        {
          valueDetail: use.detail,
          lowLabel: 'Lower use',
          averageLabel: 'Moderate',
          highLabel: 'Higher use',
        },
      ),
    )
  }

  if (metrics.conductance != null) {
    const minerals = mineralIndicatorSummary(metrics.conductance)
    cards.push(
      buildMetric(
        'Dissolved minerals indicator',
        'A conductivity reading that hints at dissolved minerals and runoff. This is one water-health signal, not a full drinking-water test.',
        minerals.value,
        'Lower',
        'Typical',
        'Higher',
        minerals.progress,
        'text-[#0284c7]',
        {
          valueDetail: minerals.detail,
          lowLabel: 'Lower',
          averageLabel: 'Typical',
          highLabel: 'Higher',
        },
      ),
    )
  }

  if (metrics.activeStations != null) {
    cards.push(
      buildMetric(
        'Local monitoring coverage',
        'How many USGS river and lake gauges in this state reported measurements recently. More active sites usually means richer local detail.',
        `${metrics.activeStations.toLocaleString('en-US')} gauges reporting`,
        '50',
        '180',
        '500',
        clampProgress(metrics.activeStations, 50, 500),
        'text-blue-600',
        {
          valueDetail: 'Active USGS monitoring sites in this state',
          lowLabel: 'Fewer sites',
          averageLabel: 'Typical',
          highLabel: 'More sites',
        },
      ),
    )
  }

  const highlights = await fetchNotableWaterHighlights(fips)
  if (highlights.length) {
    const tempIndex = cards.findIndex((card) => card.label === 'River water temperature')
    const insertAt = tempIndex === -1 ? cards.length : tempIndex
    cards.splice(insertAt, 0, ...highlights)
  }

  return cards
}

export const USGS_OGC_SOURCE = {
  name: 'USGS Water Data OGC API',
  url: 'https://api.waterdata.usgs.gov/docs/ogcapi/',
} as const

export const OPEN_METEO_SOURCE = {
  name: 'Open-Meteo Forecast API',
  url: 'https://open-meteo.com/en/docs',
} as const

export const NWDC_SOURCE = {
  name: 'USGS National Water Availability Assessment (NWDC)',
  url: 'https://water.usgs.gov/nwaa-data/',
} as const
