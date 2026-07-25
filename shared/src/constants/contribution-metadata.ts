export const HOME_TYPE_OPTIONS = [
  'Single-family home',
  'Apartment / condo',
  'Townhouse',
  'Other',
] as const

export const HOUSEHOLD_SIZE_OPTIONS = [
  { value: '1 person', label: '1 person' },
  { value: '2 people', label: '2 people' },
  { value: '3–4 people', label: '3–4 people' },
  { value: '5+ people', label: '5+ people' },
] as const

export const OWNERSHIP_OPTIONS = [
  { value: 'Own', label: 'Own' },
  { value: 'Rent', label: 'Rent' },
] as const

export const LOT_SIZE_OPTIONS = [
  { value: 'under-0.1', label: 'Under 0.1 acre' },
  { value: '0.1-0.25', label: '0.1–0.25 acres' },
  { value: '0.25-0.5', label: '0.25–0.5 acres' },
  { value: 'over-0.5', label: 'Over 0.5 acres' },
] as const

export const BATHROOM_PREFERENCE_OPTIONS = [
  { value: 'Mostly shower', label: 'Mostly shower' },
  { value: 'Mostly tub', label: 'Mostly tub' },
  { value: 'Both equally', label: 'Both equally' },
] as const

const LEGACY_HOUSEHOLD_SIZE: Record<string, string> = {
  '1': '1 person',
  '2': '2 people',
  '3-4': '3–4 people',
  '5+': '5+ people',
}

export function normalizeHouseholdSize(value?: string): string | null {
  if (!value) return null
  return LEGACY_HOUSEHOLD_SIZE[value] ?? value
}

export function normalizeOwnershipLabel(value?: string): string | null {
  if (!value) return null
  const normalized = value.toLowerCase()
  if (normalized === 'owner' || normalized === 'own') return 'Own'
  if (normalized === 'renter' || normalized === 'rent') return 'Rent'
  return value
}

export function isOwnerOccupied(value?: string): boolean {
  const normalized = value?.toLowerCase()
  return normalized === 'owner' || normalized === 'own'
}

export function lotSizeLabel(value: string): string {
  return LOT_SIZE_OPTIONS.find((option) => option.value === value)?.label ?? value
}

export function isMostlyShower(value?: string): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized === 'shower' || normalized.includes('mostly shower')
}

export function isMostlyTub(value?: string): boolean {
  if (!value) return false
  const normalized = value.toLowerCase()
  return normalized === 'tub' || normalized.includes('mostly tub')
}
