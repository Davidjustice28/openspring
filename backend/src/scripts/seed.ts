import '../config/load-env.js'
import { US_STATES } from '@openspring/shared'
import { db } from '../db/index.js'
import { states } from '../db/schema.js'

for (const s of US_STATES) {
  await db
    .insert(states)
    .values({
      name: s.name,
      abbreviation: s.abbreviation,
      slug: s.slug,
      fipsCode: s.fips,
      centroidLat: String(s.coordinates[1]),
      centroidLng: String(s.coordinates[0]),
    })
    .onConflictDoNothing()
}

console.log(`Seeded ${US_STATES.length} states`)
