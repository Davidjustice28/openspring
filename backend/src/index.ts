import './config/load-env.js'
import { createApp } from './app.js'
import { env } from './config/env.js'
import { getDashboard } from './services/dashboard.service.js'
import { purgeExpiredCache } from './services/cache.service.js'
import { ingestAllStateSnapshots } from './services/snapshot-ingest.service.js'

const app = createApp()
app.listen(env.port, () => {
  console.log(`OpenSpring API listening on http://localhost:${env.port}`)
  if (env.databaseUrl) {
    purgeExpiredCache().catch((error) => {
      console.warn('Cache purge failed:', error instanceof Error ? error.message : error)
    })
    getDashboard().catch((error) => {
      console.warn('Dashboard cache warm failed:', error instanceof Error ? error.message : error)
    })
    if (env.snapshotIngestOnStartup) {
      ingestAllStateSnapshots(2).catch((error) => {
        console.warn('Snapshot ingest failed:', error instanceof Error ? error.message : error)
      })
    }
  }
})
