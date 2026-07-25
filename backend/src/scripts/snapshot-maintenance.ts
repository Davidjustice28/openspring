import '../config/load-env.js'
import { purgeExpiredCache } from '../services/cache.service.js'
import {
  downsampleOldMetricSnapshots,
  purgeOldMetricSnapshots,
  refreshMetricSnapshotsWeeklyView,
} from '../services/snapshot.service.js'
import { purgeOldWeatherData } from '../services/state-backfill.service.js'

const cachePurged = await purgeExpiredCache()
const metricsPurged = await purgeOldMetricSnapshots()
const metricsDownsampled = await downsampleOldMetricSnapshots()
const weatherPurged = await purgeOldWeatherData()

try {
  await refreshMetricSnapshotsWeeklyView()
  console.log('Refreshed metric_snapshots_weekly materialized view')
} catch (error) {
  console.warn('Weekly view refresh skipped:', error instanceof Error ? error.message : error)
}

console.log(JSON.stringify({ cachePurged, metricsPurged, metricsDownsampled, weatherPurged }, null, 2))
