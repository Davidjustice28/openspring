import { CACHE_TTL } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'

export interface CensusData {
  population: number | null
  medianHouseholdIncome: number | null
}

export async function fetchCensusData(fips: string): Promise<CensusData> {
  const cacheKey = `census:state:${fips}`
  const cached = await getCached<CensusData>(cacheKey)
  if (cached) return cached

  const keyParam = env.censusApiKey ? `&key=${env.censusApiKey}` : ''
  const url = `https://api.census.gov/data/2023/acs/acs5?get=NAME,B01003_001E,B19013_001E&for=state:${fips}${keyParam}`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Census API unavailable')
  const data = (await res.json()) as string[][]
  const values = data[1]
  const population = values?.[1] ? Number(values[1]) : null
  let income = values?.[2] ? Number(values[2]) : null
  if (income !== null && income < 0) income = null

  const result = { population, medianHouseholdIncome: income }
  await setCache(cacheKey, url, result, CACHE_TTL.census)
  return result
}
