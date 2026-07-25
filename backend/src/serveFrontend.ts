import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Express, NextFunction, Request, Response } from 'express'
import express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/** Resolve the Vite build output (monorepo `frontend/dist`). */
export function resolveFrontendDist(): string {
  if (process.env.FRONTEND_DIST) {
    return path.resolve(process.env.FRONTEND_DIST)
  }
  // backend/dist/serveFrontend.js → ../../frontend/dist
  return path.resolve(__dirname, '../../frontend/dist')
}

/**
 * Serve the built SPA from the same origin as the API.
 * No-ops when the build directory is missing (local API-only `npm run dev`).
 */
export function serveFrontend(app: Express): boolean {
  const frontendDist = resolveFrontendDist()
  const indexHtml = path.join(frontendDist, 'index.html')

  if (!fs.existsSync(indexHtml)) {
    console.warn(`Frontend build not found at ${frontendDist}; serving API only`)
    return false
  }

  app.use(express.static(frontendDist, { index: false, maxAge: '1h' }))

  app.get(/^(?!\/api(?:\/|$)).*/, (req: Request, res: Response, next: NextFunction) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next()
      return
    }
    res.sendFile(indexHtml, (err) => {
      if (err) next(err)
    })
  })

  return true
}
