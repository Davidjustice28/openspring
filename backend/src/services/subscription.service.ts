import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import type { SubscriptionInput } from '@openspring/shared'
import { env } from '../config/env.js'
import { db } from '../db/index.js'
import { emailSubscriptions, states } from '../db/schema.js'
import { AppError } from '../lib/errors.js'

export async function createSubscription(input: SubscriptionInput) {
  if (input.website) {
    throw new AppError(400, 'Invalid submission', 'honeypot')
  }

  const stateRows = await db.select().from(states).where(eq(states.id, input.stateId)).limit(1)
  const state = stateRows[0]
  if (!state) throw new AppError(400, 'Invalid state')

  await db
    .insert(emailSubscriptions)
    .values({
      email: input.email.toLowerCase(),
      stateId: input.stateId,
      stateUpdates: input.stateUpdates,
      monthlyUploadReminders: input.monthlyUploadReminders,
    })
    .onConflictDoUpdate({
      target: emailSubscriptions.email,
      set: {
        stateId: input.stateId,
        stateUpdates: input.stateUpdates,
        monthlyUploadReminders: input.monthlyUploadReminders,
      },
    })

  if (env.resendApiKey) {
    const resend = new Resend(env.resendApiKey)
    const lines: string[] = [`You're signed up for OpenSpring water updates in ${state.name}.`]

    if (input.stateUpdates) {
      lines.push('- State updates when new data, findings, or alerts are available for your state.')
    }
    if (input.monthlyUploadReminders) {
      lines.push('- Monthly water usage upload reminders on the 1st of each month.')
    }

    lines.push('', 'No account required. You can unsubscribe at any time.')

    await resend.emails.send({
      from: env.resendFromEmail,
      to: input.email,
      subject: `OpenSpring water updates for ${state.name}`,
      text: lines.join('\n'),
    })
  }

  return { ok: true }
}
