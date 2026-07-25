import { CACHE_TTL, STATE_BY_ABBR, STATE_BY_SLUG } from '@openspring/shared'
import type { GeoStateResult } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'

const EMPTY: GeoStateResult = { fips: null, slug: null, name: null, source: null }

function isLocalIp(ip: string): boolean {
  return (
    !ip ||
    ip === 'unknown' ||
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.16.') ||
    ip.startsWith('172.17.') ||
    ip.startsWith('172.18.') ||
    ip.startsWith('172.19.') ||
    ip.startsWith('172.2') ||
    ip.startsWith('172.30.') ||
    ip.startsWith('172.31.')
  )
}

function resolveConfiguredDefault(): GeoStateResult {
  const raw = env.geoIpDefaultState?.trim().toLowerCase()
  if (!raw) return EMPTY

  const state =
    STATE_BY_SLUG[raw] ??
    STATE_BY_ABBR[raw.toUpperCase()] ??
    STATE_BY_ABBR[raw.slice(0, 2).toUpperCase()]

  if (!state) return EMPTY
  return { fips: state.fips, slug: state.slug, name: state.name, source: 'default' }
}

export async function resolveStateFromIp(ip: string): Promise<GeoStateResult> {
  if (isLocalIp(ip)) return resolveConfiguredDefault()

  const cacheKey = `geo:ip:${ip}`
  const cached = await getCached<GeoStateResult>(cacheKey)
  if (cached) return cached

  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,countryCode,region`,
      { signal: AbortSignal.timeout(5000) },
    )
    if (!res.ok) return EMPTY

    const data = (await res.json()) as { status?: string; countryCode?: string; region?: string }
    if (data.status !== 'success' || data.countryCode !== 'US' || !data.region) {
      await setCache(cacheKey, 'ip-api', EMPTY, CACHE_TTL.geoIp)
      return EMPTY
    }

    const state = STATE_BY_ABBR[data.region]
    const result: GeoStateResult = state
      ? { fips: state.fips, slug: state.slug, name: state.name, source: 'ip' }
      : EMPTY

    await setCache(cacheKey, 'ip-api', result, CACHE_TTL.geoIp)
    return result
  } catch {
    return EMPTY
  }
}
