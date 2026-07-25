import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema.js'

import { env } from '../config/env.js'

if (!env.databaseUrl) {
  throw new Error('DATABASE_URL is required')
}

const sql = neon(env.databaseUrl)
export const db = drizzle(sql, { schema })
