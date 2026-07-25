import { desc, eq, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { states, weatherData } from '../db/schema.js'
import { fetchCensusData } from './census.service.js'
import { fetchGeographyData } from './geography.service.js'
import { fetchWeatherData } from './weather.service.js'

const BACKFILL_INTERVAL_MS = 30 * 24 * 60 * 60 * 1000

export async function backfillStateProfile(stateId: number, fips: string, lat: number, lng: number): Promise<boolean> {
  const rows = await db.select().from(states).where(eq(states.id, stateId)).limit(1)
  const state = rows[0]
  if (!state) return false

  const now = new Date()
  const censusDue =
    !state.censusUpdatedAt || now.getTime() - state.censusUpdatedAt.getTime() >= BACKFILL_INTERVAL_MS
  const geoDue =
    !state.geographyUpdatedAt || now.getTime() - state.geographyUpdatedAt.getTime() >= BACKFILL_INTERVAL_MS

  const [census, geo, weather] = await Promise.all([
    censusDue ? fetchCensusData(fips).catch(() => null) : Promise.resolve(null),
    geoDue ? fetchGeographyData(fips).catch(() => null) : Promise.resolve(null),
    fetchWeatherData(lat, lng, fips).catch(() => null),
  ])

  const updates: Partial<typeof states.$inferInsert> = { updatedAt: now }

  if (census) {
    updates.population = census.population
    updates.medianHouseholdIncome = census.medianHouseholdIncome
    updates.censusUpdatedAt = now
  }

  if (geo) {
    updates.landAreaSqM = geo.landAreaSqM
    updates.waterAreaSqM = geo.waterAreaSqM
    updates.geographyUpdatedAt = now
  }

  if (census || geo) {
    await db.update(states).set(updates).where(eq(states.id, stateId))
  }

  if (weather) {
    const recentWeather = await db
      .select({ fetchedAt: weatherData.fetchedAt })
      .from(weatherData)
      .where(eq(weatherData.stateId, stateId))
      .orderBy(desc(weatherData.fetchedAt))
      .limit(1)

    const weatherDue =
      !recentWeather[0]?.fetchedAt ||
      now.getTime() - recentWeather[0].fetchedAt.getTime() >= BACKFILL_INTERVAL_MS

    if (weatherDue) {
      const monthlyTemps = weather.monthlyTemps.map((entry) => entry.avg)
      const avgTempC =
        monthlyTemps.length > 0
          ? String(((monthlyTemps.reduce((a, b) => a + b, 0) / monthlyTemps.length - 32) * 5) / 9)
          : null

      await db.insert(weatherData).values({
        stateId,
        avgTempC,
        avgTempHighC: null,
        avgTempLowC: null,
        periodStart: '2020-01-01',
        periodEnd: '2024-12-31',
        monthlyTemps: weather.monthlyTemps,
        source: 'open-meteo',
      })
    }
  }

  return Boolean(census || geo || weather)
}

export async function backfillStateProfilesIfDue(): Promise<number> {
  const rows = await db.select().from(states)
  let updated = 0

  for (const state of rows) {
    const lat = Number(state.centroidLat)
    const lng = Number(state.centroidLng)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue

    const didUpdate = await backfillStateProfile(state.id, state.fipsCode, lat, lng).catch(() => false)
    if (didUpdate) updated += 1
  }

  return updated
}

export async function purgeOldWeatherData(retentionDays = 730): Promise<number> {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
  const deleted = await db.delete(weatherData).where(lt(weatherData.fetchedAt, cutoff)).returning({ id: weatherData.id })
  return deleted.length
}
