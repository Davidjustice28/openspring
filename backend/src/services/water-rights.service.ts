import { CACHE_TTL, HAR_DWR_STATE_FIPS, WATER_RIGHTS_SUMMARY_BY_FIPS } from '@openspring/shared'
import type { WaterRightsSummary } from '@openspring/shared'
import { getCached, setCache } from './cache.service.js'
import { recordMetricSnapshots, resolveStateIdByFips, stateEntityKey, type MetricSnapshotInput } from './snapshot.service.js'

interface ColoradoNetAmountResponse {
  PageCount?: number
}

async function fetchColoradoLiveCount(): Promise<number | null> {
  const res = await fetch('https://dwr.state.co.us/Rest/GET/api/v2/waterrights/netamount?format=json&pageSize=1', {
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return null
  const payload = (await res.json()) as ColoradoNetAmountResponse
  return payload.PageCount ?? null
}

export async function fetchWaterRightsSummary(fips: string): Promise<WaterRightsSummary | null> {
  if (!HAR_DWR_STATE_FIPS.has(fips) && !WATER_RIGHTS_SUMMARY_BY_FIPS[fips]) return null

  const cacheKey = `water-rights:${fips}`
  const cached = await getCached<WaterRightsSummary>(cacheKey)
  if (cached) return cached

  const base = WATER_RIGHTS_SUMMARY_BY_FIPS[fips]
  if (!base) {
    return {
      totalRecords: null,
      recordsLabel: 'Recorded water rights',
      useShares: [],
      note: 'Harmonized western water-rights data is available for this state. Detailed breakdown coming soon.',
    }
  }

  let summary: WaterRightsSummary = { ...base, useShares: [...base.useShares] }

  if (fips === '08') {
    const liveCount = await fetchColoradoLiveCount().catch(() => null)
    if (liveCount != null) {
      summary = {
        ...summary,
        totalRecords: liveCount,
        recordsLabel: 'Recorded water-right structures',
        note: 'Live count from Colorado Division of Water Resources. Shares are illustrative.',
      }
    }
  }

  await setCache(cacheKey, 'water-rights:summary', summary, CACHE_TTL.waterRights)
  if (summary.totalRecords != null) {
    void recordWaterRightsSnapshot(fips, summary.totalRecords).catch(() => {})
  }
  return summary
}

async function recordWaterRightsSnapshot(fips: string, totalRecords: number): Promise<void> {
  const stateId = await resolveStateIdByFips(fips)
  const snapshots: MetricSnapshotInput[] = [
    {
      stateId,
      source: 'water-rights',
      metricKey: 'total_records',
      entityKey: stateEntityKey(fips),
      valueNumeric: totalRecords,
      unit: 'count',
      observedAt: new Date(),
    },
  ]
  recordMetricSnapshots(snapshots)
}
