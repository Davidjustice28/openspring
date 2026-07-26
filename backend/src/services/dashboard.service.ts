import { count, eq, gte } from 'drizzle-orm'
import type {
  ChartPoint,
  CityRestrictionPayload,
  DashboardPayload,
  DashboardStateSummary,
  StateEnvironmentalPayload,
  StateOverviewPayload,
  StatePolicyContext,
  StatePolicyPayload,
  StateProfile,
} from '@openspring/shared'
import { STATE_BY_FIPS, US_STATES } from '@openspring/shared'
import { db } from '../db/index.js'
import { contributions, states } from '../db/schema.js'
import { buildContributionAnalytics } from './contribution-analytics.service.js'
import { fetchCensusData } from './census.service.js'
import { fetchGeographyData, GEOINFO_SOURCE } from './geography.service.js'
import { fetchWeatherData } from './weather.service.js'
import { fetchWaterData, stressFromWater } from './water.service.js'
import {
  fetchEnvironmentalSnapshot,
  NWDC_SOURCE,
  OPEN_METEO_SOURCE,
  USGS_OGC_SOURCE,
} from './ogc-water.service.js'
import { fetchRestrictionCities, fetchCityRestriction } from './city-restrictions.service.js'
import { fetchWaterLegislation } from './open-states.service.js'
import { fetchWaterRightsSummary } from './water-rights.service.js'
import { fetchFarmAgSummary } from './farm-ag.service.js'
import { getCached, setCache } from './cache.service.js'
import { mapWithConcurrency } from '../lib/concurrency.js'

export const STATE_SUMMARIES_CACHE_KEY = 'dashboard:state-summaries'
const STATE_SUMMARIES_TTL = 60 * 60

export async function syncCachedContributionCount(stateId: number, contributionCount: number) {
  const cached = await getCached<DashboardStateSummary[]>(STATE_SUMMARIES_CACHE_KEY)
  if (!cached) return

  const [dbState] = await db.select().from(states).where(eq(states.id, stateId)).limit(1)
  if (!dbState) return

  const updated = cached.map((s) =>
    s.fips === dbState.fipsCode ? { ...s, contributionCount } : s,
  )
  if (updated.every((s, i) => s.contributionCount === cached[i]!.contributionCount)) return

  await setCache(STATE_SUMMARIES_CACHE_KEY, 'dashboard:state-summaries', updated, STATE_SUMMARIES_TTL)
}

function formatNumber(n: number | null): string | null {
  if (n == null) return null
  return n.toLocaleString('en-US')
}

function formatCurrency(n: number | null): string | null {
  if (n == null) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function sqMToSqMi(sqM: number | null): string | null {
  if (sqM == null) return null
  return `${Math.round(sqM / 2_589_988).toLocaleString()} sq mi`
}

function formatPercent(n: number): string {
  return `${Math.round(n)}%`
}

function formatWaterSupplyOutlook(availability: number | null): string | null {
  if (availability == null) return null
  if (availability >= 70) return 'Strong supply'
  if (availability >= 45) return 'Moderate supply'
  if (availability >= 25) return 'Limited supply'
  return 'Stressed supply'
}

function formatRegionalWaterUse(consumption: number | null): string | null {
  if (consumption == null) return null
  const rounded = Math.round(consumption * 10) / 10
  if (consumption < 15) return `Lower use (${rounded} mm/month)`
  if (consumption < 30) return `Moderate use (${rounded} mm/month)`
  return `Higher use (${rounded} mm/month)`
}

async function buildStateProfile(
  fips: string,
  lat: number,
  lng: number,
  water?: { availability: number | null; consumption: number | null },
): Promise<StateProfile> {
  const [census, geo, weather] = await Promise.all([
    fetchCensusData(fips).catch(() => ({ population: null, medianHouseholdIncome: null })),
    fetchGeographyData(fips).catch(() => ({ landAreaSqM: null, waterAreaSqM: null, source: null })),
    fetchWeatherData(lat, lng, fips).catch(() => ({ avgTempF: null, avgAnnualPrecipIn: null, monthlyTemps: [] })),
  ])

  const landAreaSqMi = geo.landAreaSqM != null ? geo.landAreaSqM / 2_589_988 : null
  const waterAreaSqMi = geo.waterAreaSqM != null ? geo.waterAreaSqM / 2_589_988 : null
  const totalAreaSqMi =
    landAreaSqMi != null || waterAreaSqMi != null ? (landAreaSqMi ?? 0) + (waterAreaSqMi ?? 0) : null
  const waterCoveragePercent =
    totalAreaSqMi != null && waterAreaSqMi != null && totalAreaSqMi > 0
      ? formatPercent((waterAreaSqMi / totalAreaSqMi) * 100)
      : null
  const populationDensity =
    census.population != null && landAreaSqMi != null && landAreaSqMi > 0
      ? `${Math.round(census.population / landAreaSqMi).toLocaleString('en-US')} people/sq mi`
      : null

  const geographySources =
    geo.source === 'geoinfo'
      ? [{ name: GEOINFO_SOURCE.name, url: GEOINFO_SOURCE.url }]
      : [{ name: 'Census TIGERweb', url: 'https://www.census.gov/data/developers/data-sets/TIGERweb-map-service.html' }]

  return {
    population: formatNumber(census.population),
    medianHouseholdIncome: formatCurrency(census.medianHouseholdIncome),
    landArea: sqMToSqMi(geo.landAreaSqM),
    waterArea: sqMToSqMi(geo.waterAreaSqM),
    waterCoveragePercent,
    populationDensity,
    averageTemperature: weather.avgTempF != null ? `${weather.avgTempF}°F` : null,
    averageAnnualPrecipitation:
      weather.avgAnnualPrecipIn != null ? `${weather.avgAnnualPrecipIn} in/yr` : null,
    waterSupplyOutlook: formatWaterSupplyOutlook(water?.availability ?? null),
    regionalWaterUse: formatRegionalWaterUse(water?.consumption ?? null),
    sources: [
      { name: 'U.S. Census Bureau ACS', url: 'https://www.census.gov/data/developers/data-sets/acs-5year.html' },
      ...geographySources,
      { name: 'Open-Meteo Historical Weather API', url: 'https://open-meteo.com/en/docs/historical-weather-api' },
    ],
  }
}

function applyContributionCounts(
  summaries: DashboardStateSummary[],
  countMap: Map<number, number>,
  dbStateByFips: Map<string, { id: number }>,
): DashboardStateSummary[] {
  return summaries.map((s) => {
    const dbState = dbStateByFips.get(s.fips)
    const contributionCount = dbState ? countMap.get(dbState.id) ?? 0 : 0
    return contributionCount === s.contributionCount ? s : { ...s, contributionCount }
  })
}

async function buildStateSummaries(countMap: Map<number, number>): Promise<DashboardStateSummary[]> {
  const dbStates = await db.select().from(states)
  const dbStateByFips = new Map(dbStates.map((row) => [row.fipsCode, row]))

  const cached = await getCached<DashboardStateSummary[]>(STATE_SUMMARIES_CACHE_KEY)
  if (cached) return applyContributionCounts(cached, countMap, dbStateByFips)

  const summaries = await mapWithConcurrency(US_STATES, 4, async (s) => {
    const water = await fetchWaterData(s.abbreviation).catch(() => ({
      availability: null,
      consumption: null,
      trends: [],
    }))
    const stress = stressFromWater(water.availability, water.consumption)
    const dbState = dbStateByFips.get(s.fips)
    const contributionCount = dbState ? countMap.get(dbState.id) ?? 0 : 0
    return {
      fips: s.fips,
      abbreviation: s.abbreviation,
      name: s.name,
      slug: s.slug,
      coordinates: s.coordinates,
      stressLevel: stress,
      contributionCount,
      waterAvailability: water.availability,
      waterConsumption: water.consumption,
    }
  })

  await setCache(STATE_SUMMARIES_CACHE_KEY, 'dashboard:state-summaries', summaries, STATE_SUMMARIES_TTL)
  return summaries
}

async function getContributionCounts() {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  const [totalRow, todayRow, countByState] = await Promise.all([
    db.select({ count: count() }).from(contributions),
    db.select({ count: count() }).from(contributions).where(gte(contributions.createdAt, todayStart)),
    db
      .select({ stateId: contributions.stateId, count: count() })
      .from(contributions)
      .groupBy(contributions.stateId),
  ])

  const countMap = new Map(countByState.map((r) => [r.stateId, Number(r.count)]))
  return {
    national: {
      contributionsToday: Number(todayRow[0]?.count ?? 0),
      totalContributions: Number(totalRow[0]?.count ?? 0),
    },
    countMap,
  }
}

export const WATER_RESTRICTIONS_SOURCE = {
  name: 'Water Restrictions API',
  url: 'https://water-restrictions.com/api',
} as const

export const OPEN_STATES_SOURCE = {
  name: 'Open States',
  url: 'https://openstates.org/',
} as const

export const WATER_RIGHTS_SOURCE = {
  name: 'HarDWR / state water-rights records',
  url: 'https://data.msdlive.org/records/h79e1-k3h91',
} as const

export const NASS_SOURCE = {
  name: 'USDA NASS Quick Stats',
  url: 'https://quickstats.nass.usda.gov/',
} as const

async function buildPolicyContext(
  selectedFips: string,
  stateSlug: string,
  stateName: string,
  stateAbbr: string,
): Promise<StatePolicyContext | null> {
  const [availableCities, legislation, waterRights, farmAg] = await Promise.all([
    fetchRestrictionCities(stateSlug).catch(() => []),
    fetchWaterLegislation(stateName).catch(() => []),
    fetchWaterRightsSummary(selectedFips).catch(() => null),
    fetchFarmAgSummary(stateAbbr).catch(() => null),
  ])

  if (!availableCities.length && !legislation.length && !waterRights && !farmAg) {
    return null
  }

  return {
    availableCities,
    legislation,
    waterRights,
    farmAg,
  }
}

async function resolveStateBuildContext(selectedFips: string, summaries: DashboardStateSummary[]) {
  const info = STATE_BY_FIPS[selectedFips]
  if (!info) return null

  const summary = summaries.find((s) => s.fips === selectedFips)
  if (!summary) return null

  const [lat, lng] = [info.coordinates[1], info.coordinates[0]]
  const dbState = await db.select().from(states).where(eq(states.fipsCode, selectedFips)).limit(1)

  return { info, summary, lat, lng, dbState }
}

export async function getStateOverview(stateQuery: string): Promise<StateOverviewPayload | null> {
  const selectedFips = resolveSelectedFips(stateQuery)
  if (!selectedFips) return null

  const { countMap } = await getContributionCounts()
  const stateSummaries = await buildStateSummaries(countMap)
  const ctx = await resolveStateBuildContext(selectedFips, stateSummaries)
  if (!ctx) return null

  const { info, summary, lat, lng, dbState } = ctx

  const [profile, water, analytics] = await Promise.all([
    buildStateProfile(selectedFips, lat, lng, {
      availability: summary.waterAvailability,
      consumption: summary.waterConsumption,
    }),
    fetchWaterData(info.abbreviation).catch(() => ({ availability: null, consumption: null, trends: [] })),
    dbState[0] ? buildContributionAnalytics(dbState[0].id) : Promise.resolve(null),
  ])

  const waterTrends: ChartPoint[] = water.trends
    .filter((t) => t.consumption != null)
    .map((t) => ({
      group: t.year,
      use: Math.round(t.consumption!),
    }))

  return {
    stressLevel: summary.stressLevel,
    contributionCount: summary.contributionCount,
    profile,
    waterTrends,
    analytics,
    sources: [...profile.sources, NWDC_SOURCE, USGS_OGC_SOURCE, OPEN_METEO_SOURCE],
  }
}

export async function getStateEnvironmental(stateQuery: string): Promise<StateEnvironmentalPayload | null> {
  const selectedFips = resolveSelectedFips(stateQuery)
  if (!selectedFips) return null

  const { countMap } = await getContributionCounts()
  const stateSummaries = await buildStateSummaries(countMap)
  const ctx = await resolveStateBuildContext(selectedFips, stateSummaries)
  if (!ctx) return null

  const { info, summary, lat, lng } = ctx
  const environmental = await fetchEnvironmentalSnapshot(
    selectedFips,
    lat,
    lng,
    summary.waterAvailability,
    summary.waterConsumption,
  )

  return { environmental }
}

export async function getStatePolicy(stateQuery: string): Promise<StatePolicyPayload> {
  const selectedFips = resolveSelectedFips(stateQuery)
  if (!selectedFips) return { policy: null }

  const info = STATE_BY_FIPS[selectedFips]
  if (!info) return { policy: null }

  const policy = await buildPolicyContext(selectedFips, info.slug, info.name, info.abbreviation)
  return { policy }
}

export async function getCityRestriction(
  stateSlug: string,
  citySlug: string,
): Promise<CityRestrictionPayload> {
  const restriction = await fetchCityRestriction(stateSlug, citySlug).catch(() => null)
  return { restriction }
}

function policySourcesFor(policy: StatePolicyContext | null) {
  if (!policy) return []
  return [
    ...(policy.availableCities.length ? [WATER_RESTRICTIONS_SOURCE] : []),
    ...(policy.legislation.length ? [OPEN_STATES_SOURCE] : []),
    ...(policy.waterRights ? [WATER_RIGHTS_SOURCE] : []),
    ...(policy.farmAg ? [NWDC_SOURCE, ...(policy.farmAg.irrigatedAcres != null ? [NASS_SOURCE] : [])] : []),
  ]
}

async function buildSelectedState(selectedFips: string, _summaries: DashboardStateSummary[]) {
  const stateQuery = STATE_BY_FIPS[selectedFips]?.slug ?? selectedFips
  const [overview, environmentalPayload, policyPayload] = await Promise.all([
    getStateOverview(stateQuery),
    getStateEnvironmental(stateQuery),
    getStatePolicy(stateQuery),
  ])

  if (!overview) return undefined

  const policy = policyPayload.policy

  return {
    stressLevel: overview.stressLevel,
    contributionCount: overview.contributionCount,
    profile: overview.profile,
    waterTrends: overview.waterTrends,
    environmental: environmentalPayload?.environmental ?? [],
    analytics: overview.analytics,
    policy,
    sources: [...overview.sources, ...policySourcesFor(policy)],
  }
}

function resolveSelectedFips(stateQuery?: string): string | undefined {
  if (!stateQuery) return undefined
  const byFips = STATE_BY_FIPS[stateQuery.padStart(2, '0')]
  const bySlug = US_STATES.find((s) => s.slug === stateQuery.toLowerCase())
  return byFips?.fips ?? bySlug?.fips
}

export async function getDashboard(stateQuery?: string): Promise<DashboardPayload> {
  const { national, countMap } = await getContributionCounts()
  const stateSummaries = await buildStateSummaries(countMap)

  const selectedFips = resolveSelectedFips(stateQuery)
  const selected = selectedFips ? await buildSelectedState(selectedFips, stateSummaries) : undefined

  return {
    national,
    states: stateSummaries,
    selected,
  }
}

export async function getStateDashboard(stateQuery: string): Promise<Pick<DashboardPayload, 'selected'>> {
  const selectedFips = resolveSelectedFips(stateQuery)
  if (!selectedFips) {
    return { selected: undefined }
  }

  const { countMap } = await getContributionCounts()
  const stateSummaries = await buildStateSummaries(countMap)
  const selected = await buildSelectedState(selectedFips, stateSummaries)
  return { selected }
}

export async function getStateList() {
  return db.select({
    id: states.id,
    fips: states.fipsCode,
    name: states.name,
    abbreviation: states.abbreviation,
    slug: states.slug,
    population: states.population,
  }).from(states).orderBy(states.name)
}
