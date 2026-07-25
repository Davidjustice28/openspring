export type NotableWaterKind = 'lake' | 'river'

export interface NotableWaterBody {
  displayName: string
  monitoringLocationId: string
  kind: NotableWaterKind
}

/** Curated USGS monitoring sites with consumer-friendly names, keyed by state FIPS. */
export const NOTABLE_WATER_BODIES_BY_FIPS: Record<string, NotableWaterBody[]> = {
  '49': [
    { displayName: 'South Arm · Great Salt Lake', monitoringLocationId: 'USGS-10010000', kind: 'lake' },
    { displayName: 'North Arm · Great Salt Lake', monitoringLocationId: 'USGS-10010100', kind: 'lake' },
    { displayName: 'Bear Lake', monitoringLocationId: 'USGS-10055000', kind: 'lake' },
    { displayName: 'Flaming Gorge Reservoir', monitoringLocationId: 'USGS-09234400', kind: 'lake' },
    { displayName: 'Strawberry Reservoir', monitoringLocationId: 'USGS-09282500', kind: 'lake' },
    { displayName: 'Deer Creek Reservoir', monitoringLocationId: 'USGS-10159000', kind: 'lake' },
    { displayName: 'Lake Powell', monitoringLocationId: 'USGS-375335110213001', kind: 'lake' },
    { displayName: 'Provo River', monitoringLocationId: 'USGS-10163000', kind: 'river' },
    { displayName: 'Jordan River', monitoringLocationId: 'USGS-10167000', kind: 'river' },
    { displayName: 'Bear River', monitoringLocationId: 'USGS-10126000', kind: 'river' },
    { displayName: 'Weber River', monitoringLocationId: 'USGS-10137000', kind: 'river' },
    { displayName: 'Colorado River', monitoringLocationId: 'USGS-09182880', kind: 'river' },
  ],
}
