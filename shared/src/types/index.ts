export type StressLevel =
  | 'Excellent'
  | 'Stable'
  | 'Watch'
  | 'Needs attention'
  | 'More data needed'

export type GroupBy =
  | 'state'
  | 'household-size'
  | 'home-type'
  | 'lot-size'
  | 'time-of-year'
  | 'season'
  | 'ownership'
  | 'outdoor-features'
  | 'indoor-features'

export interface StateInfo {
  fips: string
  abbreviation: string
  name: string
  slug: string
  coordinates: [number, number]
}

export interface StateProfile {
  population: string | null
  medianHouseholdIncome: string | null
  landArea: string | null
  waterArea: string | null
  waterCoveragePercent: string | null
  populationDensity: string | null
  averageTemperature: string | null
  averageAnnualPrecipitation: string | null
  waterSupplyOutlook: string | null
  regionalWaterUse: string | null
  sources: DataSourceCitation[]
}

export interface DataSourceCitation {
  name: string
  url: string
}

export interface ChartPoint {
  group?: string
  month?: string
  use: number
}

export interface EnvMetric {
  label: string
  description: string
  value: string
  valueDetail?: string | null
  low: string
  average: string
  high: string
  lowLabel?: string
  averageLabel?: string
  highLabel?: string
  progress: number
  tone: string
  isNamedHighlight?: boolean
  highlightKind?: 'lake' | 'river'
  highlightMeasurement?: string
  highlightReading?: number
}

export interface GroupedAnalyticsSummary {
  poolShare: number
  averageHousehold: string | null
  ownerShare: number
  typicalLotSize: string | null
  sprinklerShare: number
  gardenShare: number
  fridgeDispenserShare: number
  showerShare: number
  commonHomeType: string | null
  averageMonthlyBill: string
  change: string | null
}

export interface GroupedAnalytics {
  monthlyTrend: ChartPoint[]
  homeTypes: ChartPoint[]
  householdSizes: ChartPoint[]
  seasons: ChartPoint[]
  ownership: ChartPoint[]
  lotSizes: ChartPoint[]
  outdoorFeatures: ChartPoint[]
  indoorFeatures: ChartPoint[]
  summary: GroupedAnalyticsSummary | null
}

export interface DashboardStateSummary {
  fips: string
  abbreviation: string
  name: string
  slug: string
  coordinates: [number, number]
  stressLevel: StressLevel
  contributionCount: number
  waterAvailability: number | null
  waterConsumption: number | null
}

export interface CityRestrictionOption {
  slug: string
  city: string
}

export interface CityRestriction {
  slug: string
  city: string
  phase: string
  restriction: string
  severityLevel: 'emergency' | 'mandatory' | 'voluntary' | 'none' | string
  daysPerWeek: number | null
  allowedDays: string | null
  hours: string | null
  fineFirst: string | null
  endDate: string | null
  authority: string | null
  authorityUrl: string | null
  phone: string | null
  waterSourceShort: string | null
  dateModified: string | null
  note: string | null
}

export interface LegislationBill {
  identifier: string
  title: string
  latestAction: string | null
  latestActionDate: string | null
  session: string | null
  url: string | null
}

export interface WaterRightsUseShare {
  label: string
  sharePercent: number
}

export interface WaterRightsSummary {
  totalRecords: number | null
  recordsLabel: string
  useShares: WaterRightsUseShare[]
  note: string
}

export interface FarmAgSummary {
  irrigationWithdrawalMgd: number | null
  irrigationGroundwaterMgd: number | null
  irrigationSurfaceMgd: number | null
  publicSupplyMgd: number | null
  irrigatedAcres: number | null
  irrigatedAcresYear: number | null
  sourceYear: number
  note: string | null
}

export interface StatePolicyContext {
  availableCities: CityRestrictionOption[]
  legislation: LegislationBill[]
  waterRights: WaterRightsSummary | null
  farmAg: FarmAgSummary | null
}

export interface StateOverviewPayload {
  stressLevel: StressLevel
  contributionCount: number
  profile: StateProfile
  waterTrends: ChartPoint[]
  analytics: GroupedAnalytics | null
  sources: DataSourceCitation[]
}

export interface StateEnvironmentalPayload {
  environmental: EnvMetric[]
}

export interface StatePolicyPayload {
  policy: StatePolicyContext | null
}

export interface CityRestrictionPayload {
  restriction: CityRestriction | null
}

export interface DashboardPayload {
  national: {
    contributionsToday: number
    totalContributions: number
  }
  states: DashboardStateSummary[]
  selected?: {
    stressLevel: StressLevel
    contributionCount: number
    profile: StateProfile
    waterTrends: ChartPoint[]
    environmental: EnvMetric[]
    analytics: GroupedAnalytics | null
    policy: StatePolicyContext | null
    sources: DataSourceCitation[]
  }
}

export interface StateDashboardPayload {
  selected?: DashboardPayload['selected']
}

export interface ContributionMetadata {
  propertyType?: string
  householdSize?: string
  ownership?: string
  lotSize?: string
  bathroomPreference?: string
  hasPool?: boolean
  hasSprinklers?: boolean
  hasGarden?: boolean
  hasFridgeDispenser?: boolean
}

export interface ParsedBillFields {
  state?: string
  city?: string
  zip?: string
  waterUsed?: string
  billCost?: string
  periodStart?: string
  periodEnd?: string
}

export interface ParseBillResponse {
  parsed: ParsedBillFields
  confidence: Record<string, number>
  parseToken: string
}

export interface ContributionResult {
  id: string
  stateContributionCount: number
}

export interface StateSummary {
  id: number
  fips: string
  name: string
  abbreviation: string
  slug: string
  population: number | null
}

export interface GeoStateResult {
  fips: string | null
  slug: string | null
  name: string | null
  source: 'ip' | 'default' | null
}
