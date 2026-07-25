import { useQuery, useQueryClient } from '@tanstack/react-query'
import type {
  CityRestrictionPayload,
  DashboardPayload,
  StateEnvironmentalPayload,
  StateOverviewPayload,
  StatePolicyPayload,
} from '@openspring/shared'
import { api } from '../lib/api'

const dashboardStaleTime = 5 * 60 * 1000

export function useNationalDashboard() {
  return useQuery<DashboardPayload>({
    queryKey: ['dashboard', 'national'],
    queryFn: () => api.getDashboard(),
    staleTime: dashboardStaleTime,
    retry: 1,
  })
}

export function useStateOverview(stateQuery?: string) {
  return useQuery<StateOverviewPayload | null>({
    queryKey: ['dashboard', 'overview', stateQuery],
    queryFn: () => api.getStateOverview(stateQuery!),
    enabled: Boolean(stateQuery),
    staleTime: dashboardStaleTime,
    retry: 1,
  })
}

export function useStateEnvironmental(stateQuery?: string) {
  return useQuery<StateEnvironmentalPayload | null>({
    queryKey: ['dashboard', 'environmental', stateQuery],
    queryFn: () => api.getStateEnvironmental(stateQuery!),
    enabled: Boolean(stateQuery),
    staleTime: dashboardStaleTime,
    retry: 1,
  })
}

export function useStatePolicy(stateQuery?: string) {
  return useQuery<StatePolicyPayload>({
    queryKey: ['dashboard', 'policy', stateQuery],
    queryFn: () => api.getStatePolicy(stateQuery!),
    enabled: Boolean(stateQuery),
    staleTime: dashboardStaleTime,
    retry: 1,
  })
}

export function useCityRestriction(stateSlug?: string, citySlug?: string) {
  return useQuery<CityRestrictionPayload>({
    queryKey: ['restrictions', stateSlug, citySlug],
    queryFn: () => api.getCityRestriction(stateSlug!, citySlug!),
    enabled: Boolean(stateSlug && citySlug),
    staleTime: dashboardStaleTime,
    retry: 1,
  })
}

export function useStates() {
  return useQuery({
    queryKey: ['states'],
    queryFn: () => api.getStates(),
    staleTime: 60 * 60 * 1000,
  })
}

export function useInvalidateDashboard() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: ['dashboard'] })
}
