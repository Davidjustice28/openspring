import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import multer from 'multer'
import { contributionSchema, MAX_BILL_FILE_BYTES, stateParamSchema, subscriptionSchema } from '@openspring/shared'
import { getClientIp } from '../middleware/clientIp.js'
import { parseBillBuffer } from '../services/bill-parse.service.js'
import { createContribution } from '../services/contribution.service.js'
import { getDashboard, getStateDashboard, getStateList, getStateOverview, getStateEnvironmental, getStatePolicy, getCityRestriction } from '../services/dashboard.service.js'
import { issueParseToken } from '../services/parse-token.service.js'
import { createSubscription } from '../services/subscription.service.js'
import { fetchCensusData } from '../services/census.service.js'
import { fetchGeographyData } from '../services/geography.service.js'
import { fetchWeatherData } from '../services/weather.service.js'
import { fetchWaterData } from '../services/water.service.js'
import { resolveStateFromIp } from '../services/geo.service.js'
import { db } from '../db/index.js'
import { states } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import { AppError } from '../lib/errors.js'

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BILL_FILE_BYTES },
})

export const apiRouter = Router()

const readLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100 })
const parseHourLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'rate_limit', message: 'Too many bill uploads. Try again later.' } })
const parseDayLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 25, message: { error: 'rate_limit', message: 'Daily bill upload limit reached.' } })
const contributeHourLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 })
const contributeDayLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 30 })
const subscribeHourLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 3 })
const subscribeDayLimiter = rateLimit({ windowMs: 24 * 60 * 60 * 1000, max: 5 })

apiRouter.get('/health', (_req, res) => res.json({ status: 'ok' }))

apiRouter.get('/geo/state', readLimiter, async (req, res, next) => {
  try {
    res.json(await resolveStateFromIp(getClientIp(req)))
  } catch (e) { next(e) }
})

apiRouter.get('/states', readLimiter, async (_req, res, next) => {
  try {
    const list = await getStateList()
    res.json({ states: list })
  } catch (e) { next(e) }
})

apiRouter.get('/dashboard', readLimiter, async (req, res, next) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : undefined
    if (state) {
      res.json(await getStateDashboard(state))
      return
    }
    res.json(await getDashboard())
  } catch (e) { next(e) }
})

apiRouter.get('/dashboard/state/:state/overview', readLimiter, async (req, res, next) => {
  try {
    const state = String(req.params.state)
    res.json(await getStateOverview(state))
  } catch (e) { next(e) }
})

apiRouter.get('/dashboard/state/:state/environmental', readLimiter, async (req, res, next) => {
  try {
    const state = String(req.params.state)
    res.json(await getStateEnvironmental(state))
  } catch (e) { next(e) }
})

apiRouter.get('/dashboard/state/:state/policy', readLimiter, async (req, res, next) => {
  try {
    const state = String(req.params.state)
    res.json(await getStatePolicy(state))
  } catch (e) { next(e) }
})

apiRouter.get('/restrictions', readLimiter, async (req, res, next) => {
  try {
    const state = typeof req.query.state === 'string' ? req.query.state : undefined
    const city = typeof req.query.city === 'string' ? req.query.city : undefined
    if (!state || !city) {
      throw new AppError(400, 'state and city query parameters are required')
    }
    res.json(await getCityRestriction(state, city))
  } catch (e) { next(e) }
})

async function resolveState(slug: string) {
  const rows = await db.select().from(states).where(eq(states.slug, slug)).limit(1)
  return rows[0]
}

apiRouter.get('/states/:slug', readLimiter, async (req, res, next) => {
  try {
    const { slug } = stateParamSchema.parse(req.params)
    const state = await resolveState(slug)
    if (!state) throw new AppError(404, 'State not found')
    const lat = Number(state.centroidLat)
    const lng = Number(state.centroidLng)
    const [census, geo, weather, water] = await Promise.all([
      fetchCensusData(state.fipsCode),
      fetchGeographyData(state.fipsCode),
      fetchWeatherData(lat, lng, state.fipsCode),
      fetchWaterData(state.abbreviation),
    ])
    res.json({ state, census, geo, weather, water })
  } catch (e) { next(e) }
})

apiRouter.get('/census/:slug', readLimiter, async (req, res, next) => {
  try {
    const state = await resolveState(stateParamSchema.parse(req.params).slug)
    if (!state) throw new AppError(404, 'State not found')
    res.json(await fetchCensusData(state.fipsCode))
  } catch (e) { next(e) }
})

apiRouter.get('/weather/:slug', readLimiter, async (req, res, next) => {
  try {
    const state = await resolveState(stateParamSchema.parse(req.params).slug)
    if (!state) throw new AppError(404, 'State not found')
    res.json(await fetchWeatherData(Number(state.centroidLat), Number(state.centroidLng), state.fipsCode))
  } catch (e) { next(e) }
})

apiRouter.get('/water/:slug', readLimiter, async (req, res, next) => {
  try {
    const state = await resolveState(stateParamSchema.parse(req.params).slug)
    if (!state) throw new AppError(404, 'State not found')
    res.json(await fetchWaterData(state.abbreviation))
  } catch (e) { next(e) }
})

apiRouter.post('/bills/parse', parseHourLimiter, parseDayLimiter, upload.single('bill'), async (req, res, next) => {
  try {
    if (!req.file) throw new AppError(400, 'Bill file required')
    const { parsed, confidence } = await parseBillBuffer(req.file.buffer, req.file.mimetype, req.file.originalname)
    const parseToken = issueParseToken()
    res.json({ parsed, confidence, parseToken })
  } catch (e) { next(e) }
})

apiRouter.post('/contributions', contributeHourLimiter, contributeDayLimiter, async (req, res, next) => {
  try {
    const input = contributionSchema.parse(req.body)
    const result = await createContribution(input, getClientIp(req))
    res.status(201).json(result)
  } catch (e) { next(e) }
})

apiRouter.post('/subscriptions', subscribeHourLimiter, subscribeDayLimiter, async (req, res, next) => {
  try {
    const input = subscriptionSchema.parse(req.body)
    const result = await createSubscription(input)
    res.status(201).json(result)
  } catch (e) { next(e) }
})
