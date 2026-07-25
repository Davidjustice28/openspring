import { CACHE_TTL } from '@openspring/shared'
import type { LegislationBill } from '@openspring/shared'
import { US_STATES } from '@openspring/shared'
import { env } from '../config/env.js'
import { getCached, setCache } from './cache.service.js'
import { recordLegislationSnapshotsAsync, resolveStateIdByFips } from './snapshot.service.js'

const BASE = 'https://v3.openstates.org/bills'

interface OpenStatesBill {
  identifier?: string
  title?: string
  session?: string
  openstates_url?: string
  latest_action_description?: string
  latest_action_date?: string
  actions?: { description?: string; date?: string }[]
}

interface OpenStatesResponse {
  results?: OpenStatesBill[]
}

function mapBill(bill: OpenStatesBill): LegislationBill | null {
  if (!bill.identifier || !bill.title) return null
  const latestAction = bill.latest_action_description ?? bill.actions?.[0]?.description ?? null
  const latestActionDate = bill.latest_action_date ?? bill.actions?.[0]?.date ?? null
  return {
    identifier: bill.identifier,
    title: bill.title,
    latestAction,
    latestActionDate,
    session: bill.session ?? null,
    url: bill.openstates_url ?? null,
  }
}

export async function fetchWaterLegislation(stateName: string): Promise<LegislationBill[]> {
  if (!env.openStatesApiKey) return []

  const cacheKey = `openstates:water:${stateName.toLowerCase()}`
  const cached = await getCached<LegislationBill[]>(cacheKey)
  if (cached) return cached

  const url = new URL(BASE)
  url.searchParams.set('jurisdiction', stateName)
  url.searchParams.set('q', 'water')
  url.searchParams.set('sort', 'updated_desc')
  url.searchParams.set('per_page', '8')
  url.searchParams.set('apikey', env.openStatesApiKey)

  const res = await fetch(url, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) return []

  const payload = (await res.json()) as OpenStatesResponse
  const bills = (payload.results ?? [])
    .map(mapBill)
    .filter((bill): bill is LegislationBill => bill != null)

  await setCache(cacheKey, 'openstates:bills', bills, CACHE_TTL.legislation)
  const state = US_STATES.find((entry) => entry.name.toLowerCase() === stateName.toLowerCase())
  if (state) {
    void resolveStateIdByFips(state.fips).then((stateId) => {
      if (stateId) recordLegislationSnapshotsAsync(stateId, bills)
    })
  }
  return bills
}
