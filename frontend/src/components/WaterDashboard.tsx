import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ComposableMap, Geographies, Geography, Marker } from 'react-simple-maps'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  ActivityIcon,
  BarChart3Icon,
  ChevronDownIcon,
  CloudRainIcon,
  DropletsIcon,
  GaugeIcon,
  InfoIcon,
  RadioIcon,
  ShieldCheckIcon,
  ScaleIcon,
  SproutIcon,
  ThermometerIcon,
  TrendingUpIcon,
  UsersRoundIcon,
  WavesIcon,
  type LucideIcon,
} from 'lucide-react'
import type {
  CityRestriction,
  EnvMetric,
  FarmAgSummary,
  GroupBy,
  GroupedAnalytics,
  LegislationBill,
  StatePolicyContext,
  StateProfile,
  StressLevel,
  WaterRightsSummary,
} from '@openspring/shared'
import { US_STATES } from '@openspring/shared'
import type { ContributionData } from './ContributionForm'
import { useNationalDashboard, useStateEnvironmental, useStateOverview, useStatePolicy, useCityRestriction } from '../hooks/useDashboard'
import { Skeleton, SkeletonBlock } from './Skeleton'
import { api } from '../lib/api'

interface WaterDashboardProps {
  contribution: ContributionData | null
}

type ProfileStatus = 'idle' | 'loading' | 'ready' | 'error'

const GEO_URL = 'https://cdn.jsdelivr.net/npm/us-atlas@3/states-10m.json'

const groupOptions: { value: GroupBy; label: string }[] = [
  { value: 'household-size', label: 'Household size' },
  { value: 'home-type', label: 'Home type' },
  { value: 'lot-size', label: 'Lot size' },
  { value: 'ownership', label: 'Rent vs. own' },
  { value: 'outdoor-features', label: 'Outdoor features' },
  { value: 'indoor-features', label: 'Indoor fixtures' },
  { value: 'time-of-year', label: 'Time of year' },
  { value: 'season', label: 'Season' },
]

const ENV_ICON_BY_LABEL: Record<string, LucideIcon> = {
  'Rain this week': CloudRainIcon,
  'Dry spell outlook': ActivityIcon,
  'River flow change': TrendingUpIcon,
  'River levels': CloudRainIcon,
  'How fast rivers are flowing': GaugeIcon,
  'Lake & reservoir level change': TrendingUpIcon,
  'Lake & reservoir levels': DropletsIcon,
  'River water temperature': ThermometerIcon,
  'Regional water use': DropletsIcon,
  'Dissolved minerals indicator': ShieldCheckIcon,
  'Local monitoring coverage': RadioIcon,
}

function resolveStateQuery(param: string): string {
  const normalized = param.padStart(2, '0')
  const byFips = US_STATES.find((s) => s.fips === normalized)
  if (byFips) return byFips.fips
  const bySlug = US_STATES.find((s) => s.slug === param.toLowerCase())
  if (bySlug) return bySlug.fips
  return normalized
}

function hasDisplayValue(value: string | number | null | undefined): boolean {
  if (value == null) return false
  if (typeof value === 'number') return !Number.isNaN(value)
  const trimmed = value.trim()
  return trimmed.length > 0 && trimmed !== 'undefined' && trimmed !== 'Unavailable'
}

function envMetricIsComplete(metric: EnvMetric): boolean {
  if (metric.isNamedHighlight) {
    return hasDisplayValue(metric.value)
  }
  return (
    hasDisplayValue(metric.value) &&
    hasDisplayValue(metric.low) &&
    hasDisplayValue(metric.average) &&
    hasDisplayValue(metric.high) &&
    Number.isFinite(metric.progress)
  )
}

function chartSeriesForGroup(
  analytics: GroupedAnalytics | null | undefined,
  groupBy: GroupBy,
): { data: { group?: string; month?: string; use: number }[]; emptyReason: string } {
  if (!analytics) {
    return {
      data: [],
      emptyReason: 'At least 5 anonymous household contributions are needed before grouped usage patterns can be shown.',
    }
  }

  const series =
    groupBy === 'household-size'
      ? analytics.householdSizes
      : groupBy === 'home-type'
        ? analytics.homeTypes
        : groupBy === 'lot-size'
          ? analytics.lotSizes
          : groupBy === 'ownership'
            ? analytics.ownership
            : groupBy === 'outdoor-features'
              ? analytics.outdoorFeatures
              : groupBy === 'indoor-features'
                ? analytics.indoorFeatures
                : groupBy === 'season'
                  ? analytics.seasons
                  : analytics.monthlyTrend

  if (!series.length) {
    return {
      data: [],
      emptyReason: 'Not enough contributions in this category yet. Each group needs at least 5 households.',
    }
  }

  return { data: series, emptyReason: '' }
}

export function WaterDashboard({ contribution }: WaterDashboardProps) {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const stateMenuRef = useRef<HTMLDivElement>(null)
  const [isStateMenuOpen, setIsStateMenuOpen] = useState(false)
  const [groupBy, setGroupBy] = useState<GroupBy>('season')

  const selectedStateFips = useMemo(() => {
    const param = searchParams.get('state')
    return param ? resolveStateQuery(param) : ''
  }, [searchParams])

  const selectedCitySlug = searchParams.get('city') ?? undefined

  const selectState = useCallback(
    (fips: string) => {
      if (fips) {
        const state = US_STATES.find((s) => s.fips === fips)
        navigate(state ? `/?state=${state.slug}` : `/?state=${fips}`)
      } else {
        navigate('/')
      }
      setIsStateMenuOpen(false)
    },
    [navigate],
  )

  const selectCity = useCallback(
    (citySlug: string) => {
      const state = US_STATES.find((s) => s.fips === selectedStateFips)
      if (!state) return
      navigate(`/?state=${state.slug}&city=${encodeURIComponent(citySlug)}`)
    },
    [navigate, selectedStateFips],
  )

  useEffect(() => {
    if (searchParams.get('state')) return

    let cancelled = false
    api.getGeoState().then((geo) => {
      if (cancelled || !geo.slug) return
      navigate(`/?state=${geo.slug}`, { replace: true })
    })

    return () => {
      cancelled = true
    }
  }, [navigate, searchParams])

  useEffect(() => {
    if (!isStateMenuOpen) return

    const handlePointerDown = (event: MouseEvent) => {
      if (stateMenuRef.current?.contains(event.target as Node)) return
      setIsStateMenuOpen(false)
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsStateMenuOpen(false)
    }

    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [isStateMenuOpen])

  const {
    data: nationalData,
    isLoading: nationalLoading,
    isError: nationalError,
  } = useNationalDashboard()

  const stateSummaries = nationalData?.states ?? []
  const mapStates = useMemo(
    () =>
      stateSummaries.length > 0
        ? stateSummaries
        : US_STATES.map((s) => ({
            fips: s.fips,
            abbreviation: s.abbreviation,
            name: s.name,
            slug: s.slug,
            coordinates: s.coordinates,
            stressLevel: 'More data needed' as StressLevel,
            contributionCount: 0,
            waterAvailability: null,
            waterConsumption: null,
          })),
    [stateSummaries],
  )

  const stateByFips = useMemo(
    () => new Map(mapStates.map((s) => [s.fips, s])),
    [mapStates],
  )

  const selectedState = selectedStateFips ? stateByFips.get(selectedStateFips) : undefined
  const stateQuery = selectedState?.slug

  const {
    data: overviewData,
    isLoading: overviewLoading,
    isError: overviewError,
  } = useStateOverview(stateQuery)
  const {
    data: environmentalData,
    isLoading: environmentalLoading,
  } = useStateEnvironmental(stateQuery)
  const {
    data: policyData,
    isLoading: policyLoading,
  } = useStatePolicy(stateQuery)

  const defaultCitySlug = useMemo(() => {
    const cities = policyData?.policy?.availableCities ?? []
    if (!cities.length) return undefined
    return (
      cities.find((city) => city.slug === 'salt-lake-city')?.slug ??
      cities.find((city) => city.slug === 'denver')?.slug ??
      cities.find((city) => city.slug === 'phoenix')?.slug ??
      cities[0]?.slug
    )
  }, [policyData?.policy?.availableCities])

  const activeCitySlug = selectedCitySlug ?? defaultCitySlug

  const {
    data: cityRestrictionData,
    isLoading: cityRestrictionLoading,
  } = useCityRestriction(stateQuery, activeCitySlug)

  const policy = policyData?.policy ?? null
  const analytics = overviewData?.analytics
  const analyticsSummary = analytics?.summary ?? null
  const environmentalSnapshot = useMemo(
    () => (environmentalData?.environmental ?? []).filter(envMetricIsComplete),
    [environmentalData?.environmental],
  )
  const aggregateEnvironmental = useMemo(
    () => environmentalSnapshot.filter((metric) => !metric.isNamedHighlight),
    [environmentalSnapshot],
  )
  const namedWaterHighlights = useMemo(
    () => environmentalSnapshot.filter((metric) => metric.isNamedHighlight),
    [environmentalSnapshot],
  )
  const featuredLakes = useMemo(
    () =>
      [...namedWaterHighlights.filter((metric) => metric.highlightKind === 'lake')].sort(
        (a, b) => (b.highlightReading ?? 0) - (a.highlightReading ?? 0),
      ),
    [namedWaterHighlights],
  )
  const featuredRivers = useMemo(
    () =>
      [...namedWaterHighlights.filter((metric) => metric.highlightKind === 'river')].sort(
        (a, b) => (b.highlightReading ?? 0) - (a.highlightReading ?? 0),
      ),
    [namedWaterHighlights],
  )

  const selectedStress = selectedState?.stressLevel ?? 'Stable'
  const viewName = selectedState?.name ?? 'U.S.'
  const viewFindingsLabel = selectedState ? 'State findings' : 'National findings'
  const overviewInitialLoading = Boolean(stateQuery) && overviewLoading && !overviewData
  const environmentalInitialLoading = Boolean(stateQuery) && environmentalLoading && !environmentalData
  const policyInitialLoading = Boolean(stateQuery) && policyLoading && !policyData

  const availableGroupOptions = selectedState
    ? groupOptions
    : [{ value: 'state' as GroupBy, label: 'State' }, ...groupOptions]
  const activeGroupBy = selectedState && groupBy === 'state' ? 'season' : groupBy
  const activeGroup =
    availableGroupOptions.find((option) => option.value === activeGroupBy) ??
    groupOptions.find((option) => option.value === activeGroupBy) ??
    groupOptions[0]

  const stateWaterUse = useMemo(
    () =>
      stateSummaries
        .filter((state) => state.waterConsumption != null)
        .map((state) => ({
          group: state.abbreviation,
          use: Math.round(state.waterConsumption! * 100) / 100,
        })),
    [stateSummaries],
  )

  const stateChart = useMemo(
    () => ({
      data: stateWaterUse,
      emptyReason: stateWaterUse.length
        ? ''
        : 'USGS water consumption data is unavailable for the national map right now.',
    }),
    [stateWaterUse],
  )

  const contributionChart = useMemo(
    () => chartSeriesForGroup(analytics, activeGroupBy),
    [analytics, activeGroupBy],
  )

  const chartBundle = activeGroupBy === 'state' ? stateChart : contributionChart
  const chartData = chartBundle.data
  const chartEmptyReason = chartBundle.emptyReason

  const chartKey = activeGroupBy === 'time-of-year' ? 'month' : 'group'

  const contributionFips = useMemo(() => {
    if (!contribution?.state) return undefined
    const match = stateSummaries.find((s) => s.name === contribution.state)
    return match?.fips
  }, [contribution, stateSummaries])

  const viewContributions = selectedState
    ? (overviewData?.contributionCount ?? selectedState.contributionCount)
    : (nationalData?.national.totalContributions ?? 0)

  const todayTotal = nationalData?.national.contributionsToday ?? 0

  const profileStatus: ProfileStatus = !selectedStateFips
    ? 'idle'
    : overviewError
      ? 'error'
      : overviewInitialLoading
        ? 'loading'
        : overviewData?.profile
          ? 'ready'
          : 'error'

  const showContributionHighlight =
    contribution != null && selectedState != null && contribution.state === selectedState.name

  const findingsLoading = nationalLoading && !nationalData
  const isError = nationalError || (Boolean(selectedStateFips) && overviewError)

  return (
    <section id="dashboard" className="scroll-mt-16 bg-white pb-16 pt-10 sm:pb-20 sm:pt-14" aria-labelledby="dashboard-heading">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div id="purpose" className="mx-auto max-w-3xl scroll-mt-20 text-center">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#0284c7]">Live U.S. water contribution map</p>
          <h1 id="dashboard-heading" className="mt-3 text-3xl font-extrabold tracking-tight text-[#1e293b] sm:text-5xl">
            Water Matters, Better Data. Better Decisions.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-600">
            Help build a better understanding of how our communities use water. By anonymously sharing your household water data, you support better insights, smarter planning, and more informed water decisions for everyone.
          </p>
        </div>

        <div className="mt-9 overflow-hidden rounded-2xl border border-slate-200 bg-[#f8fafc] p-4 shadow-xl shadow-slate-900/5 sm:p-7">
          {isError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
              Dashboard data is taking longer than expected or failed to load. Check that the backend is running and try refreshing.
            </div>
          )}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-bold text-[#1e293b]">U.S. Water Health</h2>
              <p className="mt-1 text-xs text-slate-500">Select a state to see community and environmental water signals.</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-slate-600">
              <div className="relative" ref={stateMenuRef}>
                <button
                  type="button"
                  aria-haspopup="listbox"
                  aria-expanded={isStateMenuOpen}
                  onClick={() => setIsStateMenuOpen((open) => !open)}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-[#1e293b] shadow-sm transition-colors hover:border-[#0284c7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
                >
                  {selectedState?.name ?? 'USA / All states'}
                  <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${isStateMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isStateMenuOpen && (
                  <div role="listbox" aria-label="Select a state" className="absolute right-0 top-9 z-30 max-h-64 w-52 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl">
                    <button
                      type="button"
                      role="option"
                      aria-selected={!selectedStateFips}
                      onClick={() => selectState('')}
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm font-semibold ${!selectedStateFips ? 'bg-water-50 text-[#0284c7]' : 'text-[#1e293b] hover:bg-slate-50'}`}
                    >
                      USA / All states
                    </button>
                    {[...mapStates]
                      .sort((a, b) => a.name.localeCompare(b.name))
                      .map((state) => (
                        <button
                          key={state.fips}
                          type="button"
                          role="option"
                          aria-selected={selectedStateFips === state.fips}
                          onClick={() => selectState(state.fips)}
                          className={`w-full rounded-lg px-3 py-2 text-left text-sm ${selectedStateFips === state.fips ? 'bg-water-50 font-semibold text-[#0284c7]' : 'text-[#1e293b] hover:bg-slate-50'}`}
                        >
                          {state.name}
                        </button>
                      ))}
                  </div>
                )}
              </div>
              <Legend tone="excellent" label="Excellent" />
              <Legend tone="stable" label="Stable" />
              <Legend tone="watch" label="Watch" />
              <Legend tone="attention" label="Needs attention" />
              <Legend tone="default" label="More data needed" />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white px-2 py-3 sm:px-5 sm:py-4">
            {nationalLoading && !nationalData && (
              <p className="mb-3 px-3 text-center text-xs text-slate-500" role="status">
                Loading public water data for all states. First load can take up to a minute.
              </p>
            )}
            <div className={`rounded-lg bg-water-50 ${nationalLoading && !nationalData ? 'opacity-70' : ''}`}>
              <ComposableMap
                projection="geoAlbersUsa"
                projectionConfig={{ scale: 850 }}
                width={900}
                height={520}
                className="h-auto w-full"
                aria-label="Map of the United States with blue water-health levels by state"
              >
                <Geographies geography={GEO_URL}>
                  {({ geographies }) =>
                    geographies.map((geo) => {
                      const fips = String(geo.id).padStart(2, '0')
                      const state = stateByFips.get(fips)
                      if (!state) return null
                      const stress = state.stressLevel
                      const selected = fips === selectedStateFips
                      const contributed = fips === contributionFips
                      return (
                        <Geography
                          key={geo.rsmKey}
                          geography={geo}
                          onClick={() => selectState(fips)}
                          tabIndex={0}
                          aria-label={`${state.name}: ${stress} water health`}
                          style={{
                            default: {
                              fill: stateFill(stress),
                              stroke: selected ? '#0f172a' : '#ffffff',
                              strokeWidth: selected ? 2.5 : 0.8,
                              outline: 'none',
                            },
                            hover: {
                              fill: '#0284c7',
                              stroke: selected ? '#0f172a' : '#ffffff',
                              strokeWidth: selected ? 2.5 : 1.2,
                              outline: 'none',
                              cursor: 'pointer',
                            },
                            pressed: {
                              fill: stateFill(stress),
                              stroke: '#0f172a',
                              strokeWidth: 2.5,
                              outline: 'none',
                            },
                          }}
                          className={
                            selected
                              ? 'drop-shadow-[0_0_4px_rgba(2,132,199,0.9)]'
                              : contributed
                                ? 'drop-shadow-[0_0_4px_rgba(2,132,199,0.8)]'
                                : ''
                          }
                        />
                      )
                    })
                  }
                </Geographies>
                {mapStates.map((state) => {
                  const stress = state.stressLevel
                  const selected = state.fips === selectedStateFips
                  const contributed = state.fips === contributionFips
                  return (
                    <Marker key={state.fips} coordinates={state.coordinates} onClick={() => selectState(state.fips)}>
                      <text
                        textAnchor="middle"
                        y={3}
                        className="cursor-pointer select-none text-[8px] font-extrabold"
                        fill={labelFill(stress)}
                        stroke={selected ? '#1e293b' : 'none'}
                        strokeWidth={selected ? 0.35 : 0}
                        paintOrder="stroke"
                      >
                        {state.abbreviation}
                      </text>
                      {contributed && (
                        <circle cx={7} cy={-6} r={3} fill="#0284c7" stroke="#ffffff" strokeWidth={1.2}>
                          <title>Your contribution</title>
                        </circle>
                      )}
                    </Marker>
                  )
                })}
              </ComposableMap>
            </div>
          </div>

          {findingsLoading ? (
            <DashboardSkeleton />
          ) : (
            <>
              <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="findings-heading">
                <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0284c7]">{viewFindingsLabel}</p>
                    <h3 id="findings-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">
                      {viewName} Data
                    </h3>
                    <span className={`mt-3 inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${badgeTone(selectedStress)}`}>
                      {selectedStress}
                    </span>
                  </div>
                  <div className="rounded-xl bg-water-50 px-4 py-3 sm:text-right">
                    <p className="text-xs text-slate-500">Public Contributions</p>
                    <p className="mt-0.5 text-2xl font-extrabold text-[#1e293b]">{viewContributions.toLocaleString()}</p>
                  </div>
                </div>

                <section className="mt-4 rounded-xl border border-slate-200 bg-white p-4" aria-labelledby="water-use-heading">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <BarChart3Icon className="h-5 w-5 text-[#0284c7]" aria-hidden="true" />
                      <h4 id="water-use-heading" className="text-sm font-bold text-[#1e293b]">
                        Water use grouped by
                      </h4>
                    </div>
                    <label className="sr-only" htmlFor="water-use-grouping">
                      Group water use by
                    </label>
                    <select
                      id="water-use-grouping"
                      value={activeGroupBy}
                      onChange={(event) => setGroupBy(event.target.value as GroupBy)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-[#1e293b] shadow-sm outline-none transition-colors focus:border-[#0284c7] focus:ring-2 focus:ring-water-100"
                    >
                      {availableGroupOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activeGroupBy === 'state' && chartData.length > 0 && (
                    <p className="mt-4 text-[11px] font-medium text-slate-500">
                      USGS modeled water consumption by state (mm/month, {viewName === 'U.S.' ? '2010–2019' : 'latest available year'}).
                    </p>
                  )}
                  <div className="mt-2 h-60" aria-label={`Water use grouped by ${activeGroup.label.toLowerCase()} in ${viewName}`}>
                    {overviewInitialLoading && selectedStateFips ? (
                      <SkeletonBlock className="h-full" label="Loading chart" />
                    ) : chartData.length === 0 ? (
                      <div className="flex h-full items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50 px-6 text-center text-sm text-slate-600">
                        {chartEmptyReason}
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 8, right: 4, left: -22, bottom: 0 }}>
                          <CartesianGrid vertical={false} stroke="#e2e8f0" strokeDasharray="3 3" />
                          <XAxis dataKey={chartKey} tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <YAxis tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                          <Tooltip
                            cursor={{ fill: '#f0f9ff' }}
                            contentStyle={{ borderRadius: 10, borderColor: '#e2e8f0', fontSize: 12 }}
                            formatter={(value: number) => [
                              value,
                              activeGroupBy === 'state' ? 'Consumption (mm/mo)' : 'Avg monthly gallons',
                            ]}
                          />
                          <Bar dataKey="use" fill="#0284c7" radius={[6, 6, 0, 0]} name="Water use" />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {analyticsSummary && !overviewInitialLoading && (
                    <>
                      {(hasDisplayValue(analyticsSummary.averageHousehold) ||
                        hasDisplayValue(analyticsSummary.commonHomeType) ||
                        hasDisplayValue(analyticsSummary.typicalLotSize) ||
                        hasDisplayValue(analyticsSummary.ownerShare) ||
                        hasDisplayValue(analyticsSummary.averageMonthlyBill)) && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0284c7]">Community patterns in {viewName}</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            {hasDisplayValue(analyticsSummary.averageHousehold) && (
                              <MetricCard icon={UsersRoundIcon} label="Typical household" value={analyticsSummary.averageHousehold!} />
                            )}
                            {hasDisplayValue(analyticsSummary.commonHomeType) && (
                              <MetricCard icon={BarChart3Icon} label="Most common home type" value={analyticsSummary.commonHomeType!} compact />
                            )}
                            {hasDisplayValue(analyticsSummary.typicalLotSize) && (
                              <MetricCard icon={GaugeIcon} label="Typical lot size" value={analyticsSummary.typicalLotSize!} compact />
                            )}
                            {hasDisplayValue(analyticsSummary.ownerShare) && (
                              <MetricCard icon={UsersRoundIcon} label="Owner-occupied homes" value={`${analyticsSummary.ownerShare}%`} />
                            )}
                            {hasDisplayValue(analyticsSummary.averageMonthlyBill) && (
                              <MetricCard icon={DropletsIcon} label="Average water bill" value={analyticsSummary.averageMonthlyBill} compact />
                            )}
                          </div>
                        </div>
                      )}
                      {(hasDisplayValue(analyticsSummary.poolShare) ||
                        hasDisplayValue(analyticsSummary.sprinklerShare) ||
                        hasDisplayValue(analyticsSummary.gardenShare) ||
                        hasDisplayValue(analyticsSummary.fridgeDispenserShare) ||
                        hasDisplayValue(analyticsSummary.showerShare)) && (
                        <div className="mt-4 border-t border-slate-100 pt-4">
                          <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#0284c7]">Home features in contributed households</p>
                          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                            {hasDisplayValue(analyticsSummary.poolShare) && (
                              <MetricCard icon={DropletsIcon} label="Homes with a pool" value={`${analyticsSummary.poolShare}%`} />
                            )}
                            {hasDisplayValue(analyticsSummary.sprinklerShare) && (
                              <MetricCard icon={SproutIcon} label="Homes with sprinklers" value={`${analyticsSummary.sprinklerShare}%`} />
                            )}
                            {hasDisplayValue(analyticsSummary.gardenShare) && (
                              <MetricCard icon={SproutIcon} label="Homes with a garden" value={`${analyticsSummary.gardenShare}%`} />
                            )}
                            {hasDisplayValue(analyticsSummary.fridgeDispenserShare) && (
                              <MetricCard icon={DropletsIcon} label="Fridge water dispenser" value={`${analyticsSummary.fridgeDispenserShare}%`} />
                            )}
                            {hasDisplayValue(analyticsSummary.showerShare) && (
                              <MetricCard icon={WavesIcon} label="Shower over tub" value={`${analyticsSummary.showerShare}%`} />
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </section>
              </section>

              {selectedStateFips && (
                <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="environment-heading">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0284c7]">Public environmental data</p>
                      <h3 id="environment-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">
                        {viewName} Water Conditions
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                        Plain-language signals from public rain, river, and regional water data. Tap the info icon on any card for a quick explanation.
                      </p>
                    </div>
                    <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                      <p className="text-xs font-bold text-[#1e293b]">Last 7 days</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500">Updated today</p>
                    </div>
                  </div>
                  {environmentalInitialLoading ? (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 6 }, (_, index) => (
                        <Skeleton key={index} className="h-44" label="Loading environmental data" />
                      ))}
                    </div>
                  ) : aggregateEnvironmental.length === 0 ? (
                    <p className="mt-5 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
                      No public monitoring data is available for this state right now.
                    </p>
                  ) : (
                    <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {aggregateEnvironmental.map((metric) => (
                        <EnvironmentalCard key={metric.label} metric={metric} />
                      ))}
                    </div>
                  )}
                </section>
              )}

              {selectedStateFips && (environmentalInitialLoading || namedWaterHighlights.length > 0) && (
                <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="featured-water-heading">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0284c7]">Live gauge readings</p>
                      <h3 id="featured-water-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">
                        Featured Bodies of Water
                      </h3>
                      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
                        Live readings from major lakes, reservoirs, and rivers in {viewName}. Lakes show water level in feet; rivers show flow in cubic feet per second (cfs).
                      </p>
                    </div>
                    <div className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-right">
                      <p className="text-xs font-bold text-[#1e293b]">Latest readings</p>
                      <p className="mt-0.5 text-[11px] font-medium text-slate-500">Updated today</p>
                    </div>
                  </div>
                  {environmentalInitialLoading ? (
                    <div className="mt-5 space-y-3">
                      {Array.from({ length: 4 }, (_, index) => (
                        <Skeleton key={index} className="h-20" label="Loading featured water bodies" />
                      ))}
                    </div>
                  ) : (
                    <div className="mt-5 space-y-6">
                      {featuredLakes.length > 0 && (
                        <FeaturedWaterBodyGroup kind="lake" metrics={featuredLakes} />
                      )}
                      {featuredRivers.length > 0 && (
                        <FeaturedWaterBodyGroup kind="river" metrics={featuredRivers} />
                      )}
                    </div>
                  )}
                </section>
              )}

              {selectedStateFips && (policyInitialLoading || policy) && (
                <PolicyContextSection
                  stateName={viewName}
                  policy={policy}
                  policyLoading={policyInitialLoading}
                  cityRestriction={cityRestrictionData?.restriction ?? null}
                  cityRestrictionLoading={cityRestrictionLoading}
                  selectedCitySlug={activeCitySlug}
                  onCityChange={selectCity}
                />
              )}

              <StateProfileSection
                stateName={viewName}
                profile={overviewData?.profile ?? null}
                status={profileStatus}
                sources={overviewData?.sources}
              />
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <span className="font-bold text-[#0284c7]">{todayTotal.toLocaleString()}</span> anonymous contributions added today.
        </p>

        {showContributionHighlight && (
          <div
            className="mx-auto mt-5 flex max-w-3xl items-center justify-center gap-2 rounded-xl border border-savings-500/20 bg-savings-500/10 px-4 py-3 text-center text-sm text-[#065f46]"
            role="status"
          >
            <DropletsIcon className="h-4 w-4 shrink-0 text-[#10b981]" aria-hidden="true" />
            <span>
              <strong>Your {contribution!.state} data point is reflected in this dashboard preview.</strong> Only aggregate patterns are shown publicly.
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-hidden="true">
        <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 sm:flex-row sm:justify-between">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-8 w-48" />
          </div>
          <Skeleton className="h-16 w-32" />
        </div>
        <SkeletonBlock className="mt-4 h-60" />
      </section>
      <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-hidden="true">
        <Skeleton className="h-8 w-56" />
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <Skeleton key={index} className="h-44" />
          ))}
        </div>
      </section>
    </>
  )
}

function PolicyContextSection({
  stateName,
  policy,
  policyLoading,
  cityRestriction,
  cityRestrictionLoading,
  selectedCitySlug,
  onCityChange,
}: {
  stateName: string
  policy: StatePolicyContext | null
  policyLoading: boolean
  cityRestriction: CityRestriction | null
  cityRestrictionLoading: boolean
  selectedCitySlug?: string
  onCityChange: (citySlug: string) => void
}) {
  const showSection = policyLoading || policy
  if (!showSection) return null

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="policy-heading">
      <div className="border-b border-slate-100 pb-5">
        <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0284c7]">Rules & big users</p>
        <h3 id="policy-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">
          {stateName} Water Policy Context
        </h3>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
          Local watering rules, recent water legislation, farm water use estimates, and western water-rights context.
        </p>
      </div>

      <div className="mt-5 space-y-5">
        {(policy?.availableCities.length || policyLoading) && (
          <CityRestrictionsPanel
            cities={policy?.availableCities ?? []}
            restriction={cityRestriction}
            loading={cityRestrictionLoading || (policyLoading && !policy)}
            selectedCitySlug={selectedCitySlug}
            onCityChange={onCityChange}
          />
        )}

        {policyLoading && !policy ? (
          <PolicyPanelSkeleton label="Loading farm and agriculture data" />
        ) : (
          policy?.farmAg && <FarmAgPanel summary={policy.farmAg} />
        )}

        {policyLoading && !policy ? (
          <PolicyPanelSkeleton label="Loading water rights data" />
        ) : (
          policy?.waterRights && <WaterRightsPanel summary={policy.waterRights} />
        )}

        {policyLoading && !policy ? (
          <PolicyPanelSkeleton label="Loading legislation" />
        ) : (
          policy && policy.legislation.length > 0 && <LegislationPanel bills={policy.legislation} />
        )}
      </div>
    </section>
  )
}

function PolicyPanelSkeleton({ label }: { label: string }) {
  return <Skeleton className="h-28" label={label} />
}

function formatRestrictionSeverity(level: string | null): string {
  switch (level?.toLowerCase()) {
    case 'mandatory':
      return 'Required'
    case 'voluntary':
      return 'Voluntary'
    case 'emergency':
      return 'Emergency'
    default:
      return level ?? 'Active'
  }
}

function formatRestrictionDuration(endDate: string | null): string | null {
  if (!endDate) return null
  if (/permanent|ongoing|indefinite/i.test(endDate)) return 'Ongoing rules'
  if (/until conditions/i.test(endDate)) return endDate
  return `In effect through ${endDate}`
}

function formatWateringFrequency(restriction: CityRestriction): string {
  if (restriction.daysPerWeek != null) {
    return `Up to ${restriction.daysPerWeek} days per week`
  }
  if (restriction.restriction) {
    return restriction.restriction.replace(/\//g, ' per ')
  }
  return 'See your water provider for limits'
}

function formatWateringHours(hours: string | null): string {
  if (!hours) return 'Not specified. Check with your water provider.'

  const normalized = hours.replace(/\u2013/g, '-').replace(/\u2014/g, '-')
  const noWaterMatch = normalized.match(
    /no watering\s+([\d:]+\s*[ap]\.?m\.?\s*[-–]\s*[\d:]+\s*[ap]\.?m\.?)\s*\(([^)]+)\)/i,
  )
  if (noWaterMatch) {
    const timeRange = noWaterMatch[1].replace(/\s+/g, ' ').replace(/:00/g, '')
    const months = noWaterMatch[2].replace(/[–-]/g, ' through ')
    return `No outdoor watering ${timeRange}, ${months}. Allowed outside those hours.`
  }

  if (normalized.length > 140) {
    const [firstPart] = normalized.split(/\s+and\s+/i)
    return firstPart ?? hours
  }

  return hours
}

function isComplexWateringSchedule(allowedDays: string): boolean {
  return allowedDays.length > 100 || /group\s+[a-f]/i.test(allowedDays)
}

function formatAllowedDays(restriction: CityRestriction): { summary: string; detail: string | null } {
  const { allowedDays, daysPerWeek } = restriction
  if (!allowedDays) {
    return {
      summary:
        daysPerWeek != null
          ? 'Specific days are assigned by your water provider.'
          : 'Check with your water provider for assigned days.',
      detail: null,
    }
  }

  if (isComplexWateringSchedule(allowedDays)) {
    return {
      summary: 'Watering days depend on your address group. Check official rules for your assigned days.',
      detail: allowedDays,
    }
  }

  return { summary: allowedDays, detail: null }
}

function formatAuthorityLabel(restriction: CityRestriction): string {
  if (restriction.authority && restriction.authority !== 'Local') {
    return restriction.authority
  }
  return `${restriction.city} official rules`
}

function CityRestrictionsPanel({
  cities,
  restriction,
  loading,
  selectedCitySlug,
  onCityChange,
}: {
  cities: StatePolicyContext['availableCities']
  restriction: CityRestriction | null
  loading: boolean
  selectedCitySlug?: string
  onCityChange: (citySlug: string) => void
}) {
  const activeSlug = selectedCitySlug ?? cities[0]?.slug
  const allowedDays = restriction ? formatAllowedDays(restriction) : null
  const durationLabel = restriction ? formatRestrictionDuration(restriction.endDate) : null

  return (
    <div className="rounded-lg border border-amber-200 bg-gradient-to-br from-amber-50/80 to-white p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-amber-800">City watering rules</p>
          <p className="mt-1 text-sm text-slate-600">Outdoor watering limits for cities we track in this state.</p>
        </div>
        {cities.length > 0 && (
          <>
            <label className="sr-only" htmlFor="restriction-city">
              Select city
            </label>
            <select
              id="restriction-city"
              value={activeSlug ?? ''}
              onChange={(event) => onCityChange(event.target.value)}
              className="rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm font-semibold text-[#1e293b] shadow-sm outline-none focus:border-[#0284c7] focus:ring-2 focus:ring-water-100"
            >
              {cities.map((city) => (
                <option key={city.slug} value={city.slug}>
                  {city.city}
                </option>
              ))}
            </select>
          </>
        )}
      </div>

      {loading ? (
        <Skeleton className="mt-4 h-36" label="Loading city watering rules" />
      ) : restriction ? (
        <div className="mt-4 rounded-lg border border-amber-100 bg-white/90 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-base font-bold text-[#1e293b]">{restriction.city}</h4>
            {restriction.severityLevel && (
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">
                {formatRestrictionSeverity(restriction.severityLevel)}
              </span>
            )}
            {durationLabel && <span className="text-xs text-slate-500">{durationLabel}</span>}
          </div>

          <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-700">
            <li>
              <span className="font-semibold text-[#1e293b]">How often: </span>
              {formatWateringFrequency(restriction)}
            </li>
            <li>
              <span className="font-semibold text-[#1e293b]">Time limits: </span>
              {formatWateringHours(restriction.hours)}
            </li>
            {allowedDays && (
              <li>
                <span className="font-semibold text-[#1e293b]">Which days: </span>
                {allowedDays.summary}
                {allowedDays.detail && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-semibold text-[#0284c7] hover:underline">
                      View full group schedule
                    </summary>
                    <p className="mt-2 text-xs leading-relaxed text-slate-600">{allowedDays.detail}</p>
                  </details>
                )}
              </li>
            )}
          </ul>

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-amber-100 pt-3 text-xs text-slate-600">
            {restriction.waterSourceShort && <span>Water supply: {restriction.waterSourceShort}</span>}
            {restriction.fineFirst && <span>Penalty: {restriction.fineFirst}</span>}
            {restriction.authorityUrl ? (
              <a
                href={restriction.authorityUrl}
                target="_blank"
                rel="noreferrer"
                className="font-semibold text-[#0284c7] hover:underline"
              >
                {formatAuthorityLabel(restriction)}
              </a>
            ) : restriction.authority && restriction.authority !== 'Local' ? (
              <span>{restriction.authority}</span>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-600">Restriction details are unavailable for this city right now.</p>
      )}
    </div>
  )
}

function FarmAgPanel({ summary }: { summary: FarmAgSummary }) {
  return (
    <div className="rounded-lg border border-emerald-200 bg-gradient-to-br from-emerald-50/70 to-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <SproutIcon className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-800">Farm & agriculture</p>
        </div>
        <MetricInfo
          label="Farm & agriculture"
          description="State-level estimates of water used for crop irrigation, public supply, and irrigated farmland. Based on USGS modeled withdrawals and USDA census data, not live meter readings."
        />
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {summary.irrigationWithdrawalMgd != null && (
          <PolicyFact
            label="Crop irrigation (est.)"
            value={`${summary.irrigationWithdrawalMgd.toLocaleString()} MGD`}
            description="Estimated daily water withdrawn for crop irrigation statewide. From USGS National Water Use Data Compilation models. MGD = millions of gallons per day."
          />
        )}
        {summary.publicSupplyMgd != null && (
          <PolicyFact
            label="Public supply (est.)"
            value={`${summary.publicSupplyMgd.toLocaleString()} MGD`}
            description="Estimated daily water withdrawn for public water systems serving homes, businesses, and institutions. From USGS modeled data."
          />
        )}
        {summary.irrigatedAcres != null && (
          <PolicyFact
            label="Irrigated farmland"
            value={`${summary.irrigatedAcres.toLocaleString()} acres${summary.irrigatedAcresYear ? ` (${summary.irrigatedAcresYear})` : ''}`}
            description="Total acres of irrigated agricultural land in the state, from the USDA Census of Agriculture when available."
          />
        )}
        {summary.irrigationSurfaceMgd != null && summary.irrigationGroundwaterMgd != null && (
          <PolicyFact
            label="Irrigation source split"
            value={`${Math.round((summary.irrigationSurfaceMgd / (summary.irrigationWithdrawalMgd || 1)) * 100)}% surface / ${Math.round((summary.irrigationGroundwaterMgd / (summary.irrigationWithdrawalMgd || 1)) * 100)}% groundwater`}
            description="Share of crop irrigation drawn from surface water (rivers, lakes, reservoirs) versus groundwater (wells), based on USGS modeled withdrawals."
          />
        )}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">
        {summary.note ?? `USGS modeled sector water use for ${summary.sourceYear}. MGD = millions of gallons per day.`}
      </p>
    </div>
  )
}

function WaterRightsPanel({ summary }: { summary: WaterRightsSummary }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex items-center gap-2">
        <ScaleIcon className="h-4 w-4 text-slate-700" aria-hidden="true" />
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-600">Water rights</p>
      </div>
      {summary.totalRecords != null && (
        <p className="mt-3 text-2xl font-extrabold text-[#1e293b]">
          {summary.totalRecords.toLocaleString()}
          <span className="ml-2 text-sm font-semibold text-slate-500">{summary.recordsLabel.toLowerCase()}</span>
        </p>
      )}
      {summary.useShares.length > 0 && (
        <div className="mt-4 space-y-2">
          {summary.useShares.map((share) => (
            <div key={share.label}>
              <div className="flex justify-between text-xs font-semibold text-slate-600">
                <span>{share.label}</span>
                <span>{share.sharePercent}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white">
                <div className="h-1.5 rounded-full bg-[#0284c7]" style={{ width: `${share.sharePercent}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{summary.note}</p>
    </div>
  )
}

function LegislationPanel({ bills }: { bills: LegislationBill[] }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/60 to-white p-4">
      <p className="text-xs font-bold uppercase tracking-[0.14em] text-blue-800">Recent water legislation</p>
      <p className="mt-1 text-xs text-slate-600">Bills in the state legislature mentioning water. Not legal advice.</p>
      <ul className="mt-4 divide-y divide-blue-100/80">
        {bills.map((bill) => (
          <li key={`${bill.identifier}-${bill.session ?? 'session'}`} className="py-3 first:pt-0 last:pb-0">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="text-sm font-bold text-[#1e293b]">{bill.identifier}</p>
                <p className="mt-0.5 text-sm text-slate-700">{bill.title}</p>
                {bill.latestAction && (
                  <p className="mt-1 text-xs text-slate-500">
                    {bill.latestAction}
                    {bill.latestActionDate ? ` · ${bill.latestActionDate}` : ''}
                  </p>
                )}
              </div>
              {bill.url && (
                <a
                  href={bill.url}
                  target="_blank"
                  rel="noreferrer"
                  className="shrink-0 text-xs font-semibold text-[#0284c7] hover:underline"
                >
                  View bill
                </a>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function PolicyFact({ label, value, description }: { label: string; value: string; description?: string }) {
  return (
    <div className="rounded-lg bg-white/80 px-3 py-2.5">
      <div className="flex items-start justify-between gap-1">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        {description && <MetricInfo label={label} description={description} />}
      </div>
      <p className="mt-1 text-sm font-semibold leading-snug text-[#1e293b]">{value}</p>
    </div>
  )
}

function MetricCard({
  icon: Icon,
  label,
  value,
  compact = false,
}: {
  icon: LucideIcon
  label: string
  value: string
  compact?: boolean
}) {
  return (
    <article className="rounded-xl bg-water-50 p-4">
      <Icon className="h-5 w-5 text-[#0284c7]" aria-hidden="true" />
      <p className="mt-3 text-xs font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 font-extrabold text-[#1e293b] ${compact ? 'text-xl' : 'text-2xl'}`}>{value}</p>
    </article>
  )
}

function FeaturedWaterBodyGroup({ kind, metrics }: { kind: 'lake' | 'river'; metrics: EnvMetric[] }) {
  const isLake = kind === 'lake'

  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {isLake ? 'Lakes & reservoirs' : 'Rivers'}
        <span className="ml-1.5 font-medium normal-case tracking-normal text-slate-400">
          {isLake ? '· Water level (ft)' : '· Flow rate (cfs)'}
        </span>
      </p>
      <div
        className={`divide-y overflow-hidden rounded-lg border ${isLake ? 'divide-sky-200/90 border-sky-200 bg-gradient-to-br from-sky-50 to-white' : 'divide-blue-200/90 border-blue-200 bg-gradient-to-br from-blue-50/70 to-white'}`}
      >
        {metrics.map((metric) => (
          <FeaturedWaterBodyRow key={metric.label} metric={metric} />
        ))}
      </div>
    </div>
  )
}

function FeaturedWaterBodyRow({ metric }: { metric: EnvMetric }) {
  const isLake = metric.highlightKind === 'lake'
  const Icon = isLake ? DropletsIcon : GaugeIcon
  const measurement = metric.highlightMeasurement ?? (isLake ? 'Water level' : 'River flow')

  return (
    <article className="flex items-center gap-3 px-3 py-3">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${isLake ? 'bg-white/90 text-sky-700 shadow-sm' : 'bg-white/90 text-blue-600 shadow-sm'}`}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h4 className="text-sm font-semibold text-[#1e293b]">{metric.label}</h4>
        <p className="mt-0.5 text-xs text-slate-500">{measurement}</p>
      </div>
      <p className="shrink-0 text-lg font-bold tabular-nums tracking-tight text-[#1e293b]">{metric.value}</p>
    </article>
  )
}

function EnvironmentalCard({ metric }: { metric: EnvMetric }) {
  const Icon =
    metric.highlightKind === 'river'
      ? GaugeIcon
      : metric.highlightKind === 'lake'
        ? DropletsIcon
        : ENV_ICON_BY_LABEL[metric.label] ?? DropletsIcon
  const lowLabel = metric.lowLabel ?? 'Low'
  const averageLabel = metric.averageLabel ?? 'Typical'
  const highLabel = metric.highLabel ?? 'High'

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 p-4">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-water-50">
          <Icon className={`h-5 w-5 ${metric.tone}`} aria-hidden="true" />
        </span>
        <div className="flex items-start gap-2">
          <MetricInfo description={metric.description} label={metric.label} />
        </div>
      </div>
      <div className="px-4 pb-4">
        <h4 className="text-xs font-semibold text-slate-500">{metric.label}</h4>
        <p className="mt-1 text-lg font-extrabold leading-snug tracking-tight text-[#1e293b]">{metric.value}</p>
        {metric.valueDetail && <p className="mt-1 text-xs leading-relaxed text-slate-500">{metric.valueDetail}</p>}
        <div className="mt-4">
          <div className="flex justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            <span>
              {lowLabel}
              <br />
              <strong className="text-slate-600">{metric.low}</strong>
            </span>
            <span className="text-center">
              {averageLabel}
              <br />
              <strong className="text-slate-600">{metric.average}</strong>
            </span>
            <span className="text-right">
              {highLabel}
              <br />
              <strong className="text-slate-600">{metric.high}</strong>
            </span>
          </div>
          <div className="relative mt-2 h-2 rounded-full bg-slate-100">
            <span className="absolute left-1/2 top-1/2 h-3 -translate-x-1/2 -translate-y-1/2 border-l border-dashed border-slate-400" aria-hidden="true" />
            <div
              className="absolute top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-[#0284c7] shadow-sm"
              style={{ left: `calc(${metric.progress}% - 8px)` }}
              aria-label={`Current: ${metric.value}`}
            />
          </div>
        </div>
      </div>
    </article>
  )
}

function stateFill(stress: StressLevel) {
  if (stress === 'Needs attention') return '#dc2626'
  if (stress === 'Watch') return '#f59e0b'
  if (stress === 'Stable') return '#38bdf8'
  if (stress === 'Excellent') return '#0284c7'
  return '#dbeafe'
}

function labelFill(stress: StressLevel) {
  return stress === 'Needs attention' || stress === 'Watch' || stress === 'Excellent' ? '#ffffff' : '#1e293b'
}

function badgeTone(stress: StressLevel) {
  if (stress === 'Needs attention') return 'bg-red-100 text-red-800'
  if (stress === 'Watch') return 'bg-amber-100 text-amber-800'
  if (stress === 'Stable') return 'bg-sky-100 text-sky-800'
  if (stress === 'Excellent') return 'bg-blue-100 text-blue-800'
  return 'bg-slate-100 text-slate-600'
}

function Legend({ tone, label }: { tone: 'excellent' | 'stable' | 'watch' | 'attention' | 'default'; label: string }) {
  const color =
    tone === 'attention'
      ? 'bg-red-600'
      : tone === 'watch'
        ? 'bg-amber-500'
        : tone === 'stable'
          ? 'bg-sky-400'
          : tone === 'excellent'
            ? 'bg-[#0284c7]'
            : 'bg-blue-100'
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      {label}
    </span>
  )
}

function MetricInfo({ label, description }: { label: string; description: string }) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={`About ${label}`}
        className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-water-50 hover:text-[#0284c7] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0284c7]"
      >
        <InfoIcon className="h-3.5 w-3.5" />
      </button>
      <div
        role="tooltip"
        className="pointer-events-none absolute right-0 top-8 z-10 w-52 rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600 opacity-0 shadow-lg transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {description}
      </div>
    </div>
  )
}

function StateProfileSection({
  stateName,
  profile,
  status,
  sources,
}: {
  stateName: string
  profile: StateProfile | null
  status: ProfileStatus
  sources?: { name: string; url: string }[]
}) {
  const isLoading = status === 'loading' || status === 'idle'
  const cards = profile
    ? (
        [
          ['Population', profile.population],
          ['Median household income', profile.medianHouseholdIncome],
          ['Lakes, rivers, and wetlands', profile.waterArea],
          ['Land area', profile.landArea],
          ['Share of state that is water', profile.waterCoveragePercent],
          ['People per square mile', profile.populationDensity],
          ['Average annual rainfall', profile.averageAnnualPrecipitation],
          ['Average temperature', profile.averageTemperature],
          ['Regional water supply outlook', profile.waterSupplyOutlook],
          ['Estimated regional water use', profile.regionalWaterUse],
        ] as const
      ).filter(([, value]) => hasDisplayValue(value))
    : []

  const sourceLine =
    sources && sources.length > 0
      ? sources.map((s) => s.name).join(' · ')
      : 'Population and income: U.S. Census Bureau ACS · Water area: Census geography · Rainfall and temperature: Open‑Meteo.'

  return (
    <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="profile-heading">
      <p className="text-xs font-bold uppercase tracking-[0.15em] text-[#0284c7]">General information</p>
      <h3 id="profile-heading" className="mt-1 text-2xl font-extrabold text-[#1e293b]">
        {stateName} at a Glance
      </h3>
      {status === 'error' ? (
        <p className="mt-4 text-sm text-slate-600">Public profile data is temporarily unavailable. Please try another state or return shortly.</p>
      ) : status === 'idle' ? (
        <p className="mt-4 text-sm text-slate-600">Select a state to view public profile data from Census, geography, and weather sources.</p>
      ) : isLoading ? (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-24" label="Loading public data" />
          ))}
        </div>
      ) : cards.length === 0 ? (
        <p className="mt-4 text-sm text-slate-600">Limited public profile data is available for this state right now.</p>
      ) : (
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {cards.map(([label, value]) => (
            <article key={label} className="rounded-xl bg-water-50 p-4">
              <p className="text-xs font-semibold text-slate-500">{label}</p>
              <p className="mt-2 text-xl font-extrabold tracking-tight text-[#1e293b]">{value}</p>
            </article>
          ))}
        </div>
      )}
      {status === 'ready' && cards.length > 0 && <p className="mt-4 text-xs text-slate-500">{sourceLine}</p>}
    </section>
  )
}
