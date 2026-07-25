import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { eq } from 'drizzle-orm'
import { env } from '../config/env.js'
import { db } from '../db/index.js'
import { states } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import {
  getSiteLevelTrend,
  getStateLegislationChanges,
  getStateMetricsTrend,
  getStateRestrictionChanges,
  getWeeklyMetricSummary,
  listTrackedSites,
} from '../services/analytics.service.js'
import { purgeExpiredCache } from '../services/cache.service.js'
import { ingestAllStateSnapshots } from '../services/snapshot-ingest.service.js'
import {
  downsampleOldMetricSnapshots,
  purgeOldMetricSnapshots,
  refreshMetricSnapshotsWeeklyView,
} from '../services/snapshot.service.js'
import { purgeOldWeatherData } from '../services/state-backfill.service.js'

export const analyticsRouter = Router()

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })

function requireSnapshotSecret(req: { header: (name: string) => string | undefined }) {
  if (!env.snapshotSecret) {
    throw new AppError(503, 'Snapshot operations are not configured')
  }
  const provided = req.header('x-snapshot-secret')
  if (provided !== env.snapshotSecret) {
    throw new AppError(401, 'Unauthorized')
  }
}

analyticsRouter.get('/sites/:siteId/levels', readLimiter, async (req, res, next) => {
  try {
    const siteId = String(req.params.siteId)
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 90) || 90))
    res.json(await getSiteLevelTrend(siteId, days))
  } catch (e) {
    next(e)
  }
})

analyticsRouter.get('/sites', readLimiter, async (req, res, next) => {
  try {
    const stateSlug = typeof req.query.state === 'string' ? req.query.state : undefined
    res.json({ sites: await listTrackedSites(stateSlug) })
  } catch (e) {
    next(e)
  }
})

analyticsRouter.get('/states/:slug/metrics', readLimiter, async (req, res, next) => {
  try {
    const slug = String(req.params.slug)
    const days = Math.min(365, Math.max(1, Number(req.query.days ?? 90) || 90))
    const keysParam = typeof req.query.keys === 'string' ? req.query.keys : 'availability,consumption,discharge_cfs'
    const metricKeys = keysParam.split(',').map((key) => key.trim()).filter(Boolean)
    const result = await getStateMetricsTrend(slug, metricKeys, days)
    if (!result) throw new AppError(404, 'State not found')
    res.json(result)
  } catch (e) {
    next(e)
  }
})

analyticsRouter.get('/states/:slug/metrics/weekly', readLimiter, async (req, res, next) => {
  try {
    const slug = String(req.params.slug)
    const metricKey = typeof req.query.metricKey === 'string' ? req.query.metricKey : 'availability'
    const weeks = Math.min(104, Math.max(1, Number(req.query.weeks ?? 52) || 52))
    const state = (await db.select().from(states).where(eq(states.slug, slug)).limit(1))[0]
    if (!state) throw new AppError(404, 'State not found')
    const points = await getWeeklyMetricSummary(`state:${state.fipsCode}`, metricKey, weeks)
    res.json({ stateSlug: slug, metricKey, weeks, points })
  } catch (e) {
    next(e)
  }
})

analyticsRouter.get('/states/:slug/restrictions/changes', readLimiter, async (req, res, next) => {
  try {
    const slug = String(req.params.slug)
    const city = typeof req.query.city === 'string' ? req.query.city : undefined
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20))
    const result = await getStateRestrictionChanges(slug, city, limit)
    if (!result) throw new AppError(404, 'State not found')
    res.json(result)
  } catch (e) {
    next(e)
  }
})

analyticsRouter.get('/states/:slug/legislation/changes', readLimiter, async (req, res, next) => {
  try {
    const slug = String(req.params.slug)
    const limit = Math.min(100, Math.max(1, Number(req.query.limit ?? 20) || 20))
    const result = await getStateLegislationChanges(slug, limit)
    if (!result) throw new AppError(404, 'State not found')
    res.json(result)
  } catch (e) {
    next(e)
  }
})

analyticsRouter.post('/internal/snapshot-run', async (req, res, next) => {
  try {
    requireSnapshotSecret(req)
    const concurrency = Math.min(6, Math.max(1, Number(req.body?.concurrency ?? 3) || 3))
    res.json(await ingestAllStateSnapshots(concurrency))
  } catch (e) {
    next(e)
  }
})

analyticsRouter.post('/internal/snapshot-maintenance', async (req, res, next) => {
  try {
    requireSnapshotSecret(req)
    const cachePurged = await purgeExpiredCache()
    const metricsPurged = await purgeOldMetricSnapshots()
    const metricsDownsampled = await downsampleOldMetricSnapshots()
    await refreshMetricSnapshotsWeeklyView().catch(() => {})
    const weatherPurged = await purgeOldWeatherData()
    res.json({ cachePurged, metricsPurged, metricsDownsampled, weatherPurged })
  } catch (e) {
    next(e)
  }
})
