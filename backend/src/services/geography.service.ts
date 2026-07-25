import { CACHE_TTL } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'

export interface GeographyData {
  landAreaSqM: number | null
  waterAreaSqM: number | null
  source: 'tigerweb' | 'geoinfo' | null
}

function parseArea(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

async function fetchFromTigerweb(fips: string): Promise<GeographyData | null> {
  const url = `https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/State_County/MapServer/84/query?where=GEOID%3D%27${fips.padStart(2, '0')}%27&outFields=AREALAND,AREAWATER&returnGeometry=false&f=json`
  const res = await fetch(url)
  if (!res.ok) return null
  const data = (await res.json()) as { features?: { attributes?: { AREALAND?: number; AREAWATER?: number } }[] }
  const attrs = data.features?.[0]?.attributes
  const landAreaSqM = parseArea(attrs?.AREALAND)
  const waterAreaSqM = parseArea(attrs?.AREAWATER)
  if (landAreaSqM == null && waterAreaSqM == null) return null
  return { landAreaSqM, waterAreaSqM, source: 'tigerweb' }
}

async function fetchFromGeoinfo(fips: string): Promise<GeographyData | null> {
  if (!env.censusApiKey) return null

  const stateCode = String(Number(fips))
  for (const year of ['2024', '2023']) {
    const url = `https://api.census.gov/data/${year}/geoinfo?get=NAME,AREALAND,AREAWATER&for=state:${stateCode}&key=${env.censusApiKey}`
    const res = await fetch(url)
    if (!res.ok) continue
    const data = (await res.json()) as string[][]
    const values = data[1]
    if (!values) continue
    const landAreaSqM = parseArea(values[1])
    const waterAreaSqM = parseArea(values[2])
    if (landAreaSqM == null && waterAreaSqM == null) continue
    return { landAreaSqM, waterAreaSqM, source: 'geoinfo' }
  }
  return null
}

export async function fetchGeographyData(fips: string): Promise<GeographyData> {
  const cacheKey = `geography:state:${fips}`
  const cached = await getCached<GeographyData>(cacheKey)
  if (cached) return cached

  const tiger = await fetchFromTigerweb(fips).catch(() => null)
  const result = tiger ?? (await fetchFromGeoinfo(fips).catch(() => null)) ?? {
    landAreaSqM: null,
    waterAreaSqM: null,
    source: null,
  }

  await setCache(cacheKey, `geography:state:${fips}`, result, CACHE_TTL.geography)
  return result
}

export const GEOINFO_SOURCE = {
  name: 'U.S. Census Bureau GEOINFO',
  url: 'https://www.census.gov/data/developers/data-sets/geo-info.html',
} as const
