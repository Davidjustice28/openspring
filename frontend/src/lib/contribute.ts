export function contributePath(stateSlug?: string | null): string {
  if (!stateSlug) return '/contribute'
  return `/contribute?state=${encodeURIComponent(stateSlug)}`
}
