import type {
  CityRestrictionPayload,
  DashboardPayload,
  GeoStateResult,
  ParseBillResponse,
  StateEnvironmentalPayload,
  StateOverviewPayload,
  StatePolicyPayload,
} from '@openspring/shared'

const API_BASE = import.meta.env.VITE_API_URL ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.message ?? `Request failed (${res.status})`)
  }
  return res.json() as Promise<T>
}

export const api = {
  getDashboard: () => request<DashboardPayload>('/api/dashboard'),
  getStateOverview: (state: string) =>
    request<StateOverviewPayload | null>(`/api/dashboard/state/${encodeURIComponent(state)}/overview`),
  getStateEnvironmental: (state: string) =>
    request<StateEnvironmentalPayload | null>(`/api/dashboard/state/${encodeURIComponent(state)}/environmental`),
  getStatePolicy: (state: string) =>
    request<StatePolicyPayload>(`/api/dashboard/state/${encodeURIComponent(state)}/policy`),
  getCityRestriction: (stateSlug: string, citySlug: string) =>
    request<CityRestrictionPayload>(
      `/api/restrictions?state=${encodeURIComponent(stateSlug)}&city=${encodeURIComponent(citySlug)}`,
    ),
  getGeoState: () => request<GeoStateResult>('/api/geo/state'),
  getStates: () => request<{ states: { id: number; name: string; abbreviation: string; slug: string; fips: string }[] }>('/api/states'),
  parseBill: async (file: File): Promise<ParseBillResponse> => {
    const form = new FormData()
    form.append('bill', file)
    const res = await fetch(`${API_BASE}/api/bills/parse`, { method: 'POST', body: form })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body.message ?? 'Failed to parse bill')
    }
    return res.json() as Promise<ParseBillResponse>
  },
  contribute: (body: unknown) =>
    request('/api/contributions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  subscribe: (body: unknown) =>
    request('/api/subscriptions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
}
