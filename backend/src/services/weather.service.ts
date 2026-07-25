import { CACHE_TTL } from '@openspring/shared'
import { getCached, setCache } from './cache.service.js'

export interface WeatherDataResult {
  avgTempF: number | null
  avgAnnualPrecipIn: number | null
  monthlyTemps: { month: string; avg: number }[]
}

export async function fetchWeatherData(lat: number, lng: number, fips: string): Promise<WeatherDataResult> {
  const cacheKey = `weather:state:${fips}:2020-2024`
  const cached = await getCached<WeatherDataResult>(cacheKey)
  if (cached) return cached

  const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=2020-01-01&end_date=2024-12-31&daily=temperature_2m_mean,precipitation_sum&temperature_unit=fahrenheit&precipitation_unit=inch&timezone=auto`
  const res = await fetch(url)
  if (!res.ok) throw new Error('Open-Meteo API unavailable')
  const data = (await res.json()) as {
    daily?: {
      time?: string[]
      temperature_2m_mean?: (number | null)[]
      precipitation_sum?: (number | null)[]
    }
  }
  const times = data.daily?.time ?? []
  const temps = data.daily?.temperature_2m_mean ?? []
  const precip = data.daily?.precipitation_sum ?? []

  const monthlyBuckets = new Map<string, number[]>()
  const yearlyPrecip = new Map<string, number>()
  for (let i = 0; i < times.length; i++) {
    const t = temps[i]
    const p = precip[i]
    const day = times[i]
    if (!day) continue
    if (t != null) {
      const month = day.slice(0, 7)
      if (!monthlyBuckets.has(month)) monthlyBuckets.set(month, [])
      monthlyBuckets.get(month)!.push(t)
    }
    if (p != null) {
      const year = day.slice(0, 4)
      yearlyPrecip.set(year, (yearlyPrecip.get(year) ?? 0) + p)
    }
  }

  const monthlyTemps = Array.from(monthlyBuckets.entries())
    .slice(-12)
    .map(([month, values]) => ({
      month: new Date(`${month}-01`).toLocaleString('en-US', { month: 'short' }),
      avg: Math.round(values.reduce((a, b) => a + b, 0) / values.length),
    }))

  const allTemps = temps.filter((t): t is number => t != null)
  const avgTempF = allTemps.length ? Math.round(allTemps.reduce((a, b) => a + b, 0) / allTemps.length) : null

  const yearlyTotals = [...yearlyPrecip.values()]
  const avgAnnualPrecipIn = yearlyTotals.length
    ? Math.round((yearlyTotals.reduce((a, b) => a + b, 0) / yearlyTotals.length) * 10) / 10
    : null

  const result = { avgTempF, avgAnnualPrecipIn, monthlyTemps }
  await setCache(cacheKey, url, result, CACHE_TTL.weather)
  return result
}
