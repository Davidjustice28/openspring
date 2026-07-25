import { and, count, eq } from 'drizzle-orm'
import type { ContributionInput } from '@openspring/shared'
import { db } from '../db/index.js'
import { contributions } from '../db/schema.js'
import { AppError } from '../lib/errors.js'
import { consumeParseToken } from './parse-token.service.js'

const recentFingerprints = new Map<string, number>()

export function trackDuplicateFingerprint(fingerprint: string): boolean {
  const existing = recentFingerprints.get(fingerprint)
  if (existing && Date.now() - existing < 24 * 60 * 60 * 1000) return true
  recentFingerprints.set(fingerprint, Date.now())
  return false
}

export async function createContribution(input: ContributionInput, clientIp: string) {
  if (input.website) {
    throw new AppError(400, 'Invalid submission', 'honeypot')
  }

  if (input.source === 'bill') {
    if (!input.parseToken || !consumeParseToken(input.parseToken)) {
      throw new AppError(400, 'Valid parseToken required for bill contributions', 'invalid_parse_token')
    }
  }

  const fingerprint = `${input.stateId}:${input.city}:${input.zip}:${input.waterUsedGallons}:${input.billCostCents}:${input.periodStart}:${input.periodEnd}:${clientIp}`
  if (trackDuplicateFingerprint(fingerprint)) {
    throw new AppError(409, 'Similar contribution already submitted recently', 'duplicate')
  }

  const existing = await db
    .select({ id: contributions.id })
    .from(contributions)
    .where(
      and(
        eq(contributions.zip, input.zip),
        eq(contributions.periodStart, input.periodStart),
        eq(contributions.periodEnd, input.periodEnd),
      ),
    )
    .limit(1)

  if (existing.length > 0) {
    throw new AppError(409, 'This billing period may already be contributed. Edit values or try another period.', 'period_exists')
  }

  const [row] = await db
    .insert(contributions)
    .values({
      stateId: input.stateId,
      city: input.city,
      zip: input.zip,
      waterUsedGallons: String(input.waterUsedGallons),
      billCostCents: input.billCostCents,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      source: input.source,
      metadata: input.metadata ?? {},
    })
    .returning({ id: contributions.id })

  const [countRow] = await db
    .select({ count: count() })
    .from(contributions)
    .where(eq(contributions.stateId, input.stateId))

  return { id: row!.id, stateContributionCount: Number(countRow?.count ?? 0) }
}
