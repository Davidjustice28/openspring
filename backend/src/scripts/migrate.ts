import ws from 'ws'
import { Pool, neonConfig } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-serverless'
import { migrate } from 'drizzle-orm/neon-serverless/migrator'
import { env } from '../config/env.js'

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required. Add it to .env at the project root.')
}

neonConfig.webSocketConstructor = ws

const pool = new Pool({ connectionString: env.databaseUrl })
const db = drizzle(pool)

try {
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('Migrations complete')
} finally {
  await pool.end()
}
