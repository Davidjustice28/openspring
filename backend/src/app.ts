import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import { env } from './config/env.js'
import { errorHandler } from './middleware/errorHandler.js'
import { apiRouter } from './routes/api.js'
import { analyticsRouter } from './routes/analytics.js'
import { serveFrontend } from './serveFrontend.js'

export function createApp() {
  const app = express()
  if (env.trustProxy) app.set('trust proxy', 1)

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          "font-src": ["'self'", 'https://fonts.gstatic.com'],
          "img-src": ["'self'", 'data:', 'blob:'],
          "connect-src": ["'self'", 'https://cdn.jsdelivr.net'],
          "worker-src": ["'self'", 'blob:'],
        },
      },
    }),
  )
  app.use(cors())
  app.use(express.json({ limit: '1mb' }))
  app.use('/api', apiRouter)
  app.use('/api/analytics', analyticsRouter)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found', message: 'Not found' })
  })

  serveFrontend(app)

  app.use(errorHandler)
  return app
}
