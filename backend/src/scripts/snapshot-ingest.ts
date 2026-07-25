import '../config/load-env.js'
import { ingestAllStateSnapshots } from '../services/snapshot-ingest.service.js'

const concurrency = Math.min(6, Math.max(1, Number(process.argv[2] ?? 3) || 3))

const result = await ingestAllStateSnapshots(concurrency)
console.log(JSON.stringify(result, null, 2))

if (result.errors.length) {
  process.exitCode = 1
}
