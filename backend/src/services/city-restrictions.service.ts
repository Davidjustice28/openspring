import { CACHE_TTL } from '@openspring/shared'
import type { CityRestriction, CityRestrictionOption } from '@openspring/shared'
import { getCached, setCache } from './cache.service.js'
import { recordCityRestrictionSnapshotAsync, resolveStateIdBySlug } from './snapshot.service.js'

const BASE = 'https://water-restrictions.com/api/v1/restrictions'

interface RawCity {
  slug: string
  city: string
  state_slug: string
  phase?: string
  restriction?: string
  severity_level?: string
  days_per_week?: number | null
  allowed_days?: string | null
  hours?: string | null
  fine_first?: string | null
  end_date?: string | null
  authority?: string | null
  authority_url?: string | null
  phone?: string | null
  water_source_short?: string | null
  date_modified?: string | null
  note?: string | null
}

interface StateResponse {
  cities?: RawCity[]
  city?: RawCity
}

function mapCity(raw: RawCity): CityRestriction {
  return {
    slug: raw.slug,
    city: raw.city,
    phase: raw.phase ?? 'Unknown',
    restriction: raw.restriction ?? 'No restriction listed',
    severityLevel: raw.severity_level ?? 'none',
    daysPerWeek: raw.days_per_week ?? null,
    allowedDays: raw.allowed_days ?? null,
    hours: raw.hours ?? null,
    fineFirst: raw.fine_first ?? null,
    endDate: raw.end_date ?? null,
    authority: raw.authority ?? null,
    authorityUrl: raw.authority_url ?? null,
    phone: raw.phone ?? null,
    waterSourceShort: raw.water_source_short ?? null,
    dateModified: raw.date_modified ?? null,
    note: raw.note ?? null,
  }
}

export async function fetchRestrictionCities(stateSlug: string): Promise<CityRestrictionOption[]> {
  const cacheKey = `restrictions:cities:${stateSlug}`
  const cached = await getCached<CityRestrictionOption[]>(cacheKey)
  if (cached) return cached

  const res = await fetch(`${BASE}?state=${encodeURIComponent(stateSlug)}`, {
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) return []

  const payload = (await res.json()) as StateResponse
  const cities = (payload.cities ?? [])
    .map((city) => ({ slug: city.slug, city: city.city }))
    .sort((a, b) => a.city.localeCompare(b.city))

  await setCache(cacheKey, 'water-restrictions:cities', cities, CACHE_TTL.cityRestrictions)
  return cities
}

export async function fetchCityRestriction(
  stateSlug: string,
  citySlug: string,
): Promise<CityRestriction | null> {
  const cacheKey = `restrictions:city:${stateSlug}:${citySlug}`
  const cached = await getCached<CityRestriction>(cacheKey)
  if (cached) return cached

  const res = await fetch(
    `${BASE}?state=${encodeURIComponent(stateSlug)}&city=${encodeURIComponent(citySlug)}`,
    { signal: AbortSignal.timeout(15_000) },
  )
  if (!res.ok) return null

  const payload = (await res.json()) as StateResponse
  if (!payload.city) return null

  const mapped = mapCity(payload.city)
  await setCache(cacheKey, 'water-restrictions:city', mapped, CACHE_TTL.cityRestrictions)
  void resolveStateIdBySlug(stateSlug).then((stateId) => {
    if (stateId) recordCityRestrictionSnapshotAsync(stateId, mapped, { skipIfUnchanged: true })
  })
  return mapped
}
