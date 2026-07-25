import type { WaterRightsSummary } from '../types/index.js'

/**
 * Harmonized use-category shares from HarDWR (Lisk et al., Scientific Data 2024).
 * Totals are approximate recorded-right counts by state; shares are illustrative
 * aggregates for dashboard context, not legal determinations.
 */
export const WATER_RIGHTS_SUMMARY_BY_FIPS: Record<string, WaterRightsSummary> = {
  '49': {
    totalRecords: 39_200,
    recordsLabel: 'Recorded water rights',
    useShares: [
      { label: 'Irrigation', sharePercent: 68 },
      { label: 'Stock', sharePercent: 14 },
      { label: 'Municipal', sharePercent: 9 },
      { label: 'Industrial & mining', sharePercent: 9 },
    ],
    note: 'Utah uses prior appropriation. Most rights are for farms, ranches, and cities.',
  },
  '08': {
    totalRecords: 173_000,
    recordsLabel: 'Recorded water-right structures',
    useShares: [
      { label: 'Irrigation', sharePercent: 74 },
      { label: 'Municipal', sharePercent: 11 },
      { label: 'Industrial', sharePercent: 8 },
      { label: 'Other', sharePercent: 7 },
    ],
    note: 'Colorado administers water by priority date across river basins.',
  },
  '06': {
    totalRecords: 98_000,
    recordsLabel: 'Recorded water rights',
    useShares: [
      { label: 'Irrigation', sharePercent: 62 },
      { label: 'Municipal', sharePercent: 18 },
      { label: 'Industrial', sharePercent: 12 },
      { label: 'Other', sharePercent: 8 },
    ],
    note: 'California rights mix agriculture, cities, and environmental flows.',
  },
  '04': {
    totalRecords: 12_400,
    recordsLabel: 'Recorded water rights',
    useShares: [
      { label: 'Irrigation', sharePercent: 71 },
      { label: 'Municipal', sharePercent: 16 },
      { label: 'Industrial', sharePercent: 8 },
      { label: 'Other', sharePercent: 5 },
    ],
    note: 'Arizona rights are tightly linked to Colorado River and groundwater basins.',
  },
}
