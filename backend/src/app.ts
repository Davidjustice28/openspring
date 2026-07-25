import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { apiRouter } from './routes/api.js'
import { analyticsRouter } from './routes/analytics.js'

export function createApp() {
  const app = express()
  if (env.trustProxy) app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', apiRouter)
  app.use('/api/analytics', analyticsRouter)
  app.use(errorHandler)
  return app
}
