import { and, eq, gt, lt } from 'drizzle-orm'
import { db } from '../db/index.js'
import { apiCache } from '../db/schema.js'

export async function getCached<T>(cacheKey: string): Promise<T | null> {
  const rows = await db
    .select()
    .from(apiCache)
    .where(and(eq(apiCache.cacheKey, cacheKey), gt(apiCache.expiresAt, new Date())))
    .limit(1)
  return (rows[0]?.response as T) ?? null
}

export async function setCache(cacheKey: string, endpoint: string, response: unknown, ttlSeconds: number) {
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
  await db
    .insert(apiCache)
    .values({ cacheKey, endpoint, response, expiresAt })
    .onConflictDoUpdate({
      target: apiCache.cacheKey,
      set: { endpoint, response, expiresAt, createdAt: new Date() },
    })
}

export async function purgeExpiredCache() {
  const deleted = await db.delete(apiCache).where(lt(apiCache.expiresAt, new Date())).returning({ id: apiCache.id })
  return deleted.length
}
