import { z } from 'zod'

export const contributionMetadataSchema = z.object({
  propertyType: z.string().optional(),
  householdSize: z.string().optional(),
  ownership: z.string().optional(),
  lotSize: z.string().optional(),
  bathroomPreference: z.string().optional(),
  hasPool: z.boolean().optional(),
  hasSprinklers: z.boolean().optional(),
  hasGarden: z.boolean().optional(),
  hasFridgeDispenser: z.boolean().optional(),
})

export const contributionSchema = z.object({
  stateId: z.number().int().positive(),
  city: z.string().min(1).max(100),
  zip: z.string().regex(/^\d{5}(-\d{4})?$/),
  waterUsedGallons: z.number().positive().max(1_000_000),
  billCostCents: z.number().int().min(0).max(1_000_000),
  periodStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodEnd: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  source: z.enum(['bill', 'manual']),
  parseToken: z.string().optional(),
  metadata: contributionMetadataSchema.optional(),
  website: z.string().max(0).optional(),
}).superRefine((data, ctx) => {
  if (data.source === 'bill' && !data.parseToken) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'parseToken required for bill source', path: ['parseToken'] })
  }
  if (data.periodEnd < data.periodStart) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'periodEnd must be after periodStart', path: ['periodEnd'] })
  }
})

export const subscriptionSchema = z.object({
  email: z.string().email(),
  stateId: z.number().int().positive(),
  stateUpdates: z.boolean(),
  monthlyUploadReminders: z.boolean(),
  website: z.string().max(0).optional(),
}).superRefine((data, ctx) => {
  if (!data.stateUpdates && !data.monthlyUploadReminders) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Select at least one notification type',
      path: ['stateUpdates'],
    })
  }
})

export const stateParamSchema = z.object({
  slug: z.string().min(1),
})

export type ContributionInput = z.infer<typeof contributionSchema>
export type SubscriptionInput = z.infer<typeof subscriptionSchema>
