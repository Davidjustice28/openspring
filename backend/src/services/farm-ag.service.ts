import { CACHE_TTL, STATE_BY_ABBR } from '@openspring/shared'
import type { FarmAgSummary } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'
import {
  recordMetricSnapshots,
  resolveStateIdByFips,
  stateEntityKey,
  type MetricSnapshotInput,
} from './snapshot.service.js'

const NWDC_BASE = 'https://api.water.usgs.gov/nwaa-data/data'
const NWDC_YEAR = 2019

interface NwdcRow {
  year?: string
  irrwdtot?: number
  irrwdgw?: number
  irrwdsw?: number
  pswdtot?: number
}

interface NwdcResponse {
  data?: Record<string, NwdcRow[]>
  metadata?: { links?: { rel?: string; href?: string }[] }
}

interface NassRow {
  Value?: string
  Year?: number
}

interface NassResponse {
  data?: NassRow[]
}

async function fetchNwdcTotals(
  model: string,
  variables: string[],
  abbreviation: string,
): Promise<Record<string, number>> {
  const totals: Record<string, number> = Object.fromEntries(variables.map((v) => [v, 0]))
  let url: string | null =
    `${NWDC_BASE}?model=${model}&variable=${variables.join(',')}&timeRes=annualcy&startDate=${NWDC_YEAR}&endDate=${NWDC_YEAR}&location=stateCd:${abbreviation}&format=json&limit=600`

  while (url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(25_000) })
    if (!res.ok) break
    const payload = (await res.json()) as NwdcResponse
    const rawData = payload.data ?? {}
    const hucBlocks =
      rawData && typeof rawData === 'object' && 'huc12_id' in rawData
        ? ((rawData as { huc12_id?: Record<string, NwdcRow[]> }).huc12_id ?? {})
        : (rawData as Record<string, NwdcRow[]>)
    for (const rows of Object.values(hucBlocks)) {
      const row = rows.find((entry) => entry.year?.slice(0, 4) === String(NWDC_YEAR)) ?? rows[0]
      if (!row) continue
      for (const variable of variables) {
        const value = row[variable as keyof NwdcRow]
        if (typeof value === 'number') totals[variable] = (totals[variable] ?? 0) + value
      }
    }
    url = payload.metadata?.links?.find((link) => link.rel === 'next')?.href ?? null
  }

  return totals
}

async function fetchIrrigatedAcres(stateAbbr: string): Promise<{ acres: number | null; year: number | null }> {
  if (!env.nassApiKey) return { acres: null, year: null }

  const url = new URL('https://quickstats.nass.usda.gov/api/api_GET/')
  url.searchParams.set('key', env.nassApiKey)
  url.searchParams.set('source_desc', 'CENSUS')
  url.searchParams.set('sector_desc', 'ENVIRONMENTAL')
  url.searchParams.set('group_desc', 'FARMS & LAND')
  url.searchParams.set('commodity_desc', 'AG LAND')
  url.searchParams.set('statisticcat_desc', 'AREA')
  url.searchParams.set('unit_desc', 'ACRES')
  url.searchParams.set('prodn_practice_desc', 'IRRIGATED')
  url.searchParams.set('agg_level_desc', 'STATE')
  url.searchParams.set('state_alpha', stateAbbr)
  url.searchParams.set('year', '2022')
  url.searchParams.set('format', 'JSON')

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return { acres: null, year: null }

  const payload = (await res.json()) as NassResponse
  const row = payload.data?.[0]
  if (!row?.Value) return { acres: null, year: null }

  const acres = Number(String(row.Value).replace(/,/g, ''))
  return {
    acres: Number.isFinite(acres) ? acres : null,
    year: row.Year ?? 2022,
  }
}

function roundMgd(value: number): number {
  return Math.round(value * 10) / 10
}

export async function fetchFarmAgSummary(abbreviation: string): Promise<FarmAgSummary | null> {
  const cacheKey = `farm-ag:${abbreviation}:${NWDC_YEAR}`
  const cached = await getCached<FarmAgSummary>(cacheKey)
  if (cached) return cached

  const irrigation = await fetchNwdcTotals('wu-irrigation-wd', ['irrwdtot', 'irrwdgw', 'irrwdsw'], abbreviation).catch(
    () => ({ irrwdtot: 0, irrwdgw: 0, irrwdsw: 0 }),
  )
  const publicSupply = await fetchNwdcTotals('wu-public-supply-wd', ['pswdtot'], abbreviation).catch(
    () => ({ pswdtot: 0 }),
  )
  const irrigated = await fetchIrrigatedAcres(abbreviation).catch(() => ({ acres: null, year: null }))

  const irrigationTotal = irrigation.irrwdtot || null
  const publicSupplyTotal = publicSupply.pswdtot || null

  if (!irrigationTotal && !publicSupplyTotal && irrigated.acres == null) return null

  const summary: FarmAgSummary = {
    irrigationWithdrawalMgd: irrigationTotal ? roundMgd(irrigationTotal) : null,
    irrigationGroundwaterMgd: irrigation.irrwdgw ? roundMgd(irrigation.irrwdgw) : null,
    irrigationSurfaceMgd: irrigation.irrwdsw ? roundMgd(irrigation.irrwdsw) : null,
    publicSupplyMgd: publicSupplyTotal ? roundMgd(publicSupplyTotal) : null,
    irrigatedAcres: irrigated.acres,
    irrigatedAcresYear: irrigated.year,
    sourceYear: NWDC_YEAR,
    note:
      irrigationTotal && publicSupplyTotal && irrigationTotal + publicSupplyTotal > 0
        ? `Estimated crop irrigation was about ${Math.round((irrigationTotal / (irrigationTotal + publicSupplyTotal)) * 100)}% of combined irrigation and public-supply withdrawals in ${NWDC_YEAR} (USGS modeled data).`
        : null,
  }

  await setCache(cacheKey, 'nwdc:farm-ag', summary, CACHE_TTL.farmAg)
  void recordFarmAgMetricSnapshots(abbreviation, summary).catch(() => {})
  return summary
}

async function recordFarmAgMetricSnapshots(abbreviation: string, summary: FarmAgSummary): Promise<void> {
  const info = STATE_BY_ABBR[abbreviation]
  if (!info) return

  const stateId = await resolveStateIdByFips(info.fips)
  const entityKey = stateEntityKey(info.fips)
  const observedAt = new Date()
  const entries: { key: string; value: number | null; unit: string }[] = [
    { key: 'irrigation_mgd', value: summary.irrigationWithdrawalMgd, unit: 'MGD' },
    { key: 'irrigation_groundwater_mgd', value: summary.irrigationGroundwaterMgd, unit: 'MGD' },
    { key: 'irrigation_surface_mgd', value: summary.irrigationSurfaceMgd, unit: 'MGD' },
    { key: 'public_supply_mgd', value: summary.publicSupplyMgd, unit: 'MGD' },
    { key: 'irrigated_acres', value: summary.irrigatedAcres, unit: 'acres' },
  ]

  const snapshots: MetricSnapshotInput[] = entries
    .filter((entry) => entry.value != null)
    .map((entry) => ({
      stateId,
      source: 'nwdc',
      metricKey: entry.key,
      entityKey,
      entityLabel: info.name,
      valueNumeric: entry.value,
      unit: entry.unit,
      observedAt,
      payload: { sourceYear: summary.sourceYear },
    }))

  recordMetricSnapshots(snapshots)
}
