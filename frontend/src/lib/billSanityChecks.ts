const MIN_GALLONS = 500
const MAX_GALLONS = 150_000
const MIN_PERIOD_DAYS = 20
const MAX_PERIOD_DAYS = 45

export interface BillFormValues {
  waterUsed: string
  billCost: string
  periodStart: string
  periodEnd: string
}

function parseGallons(value: string): number | undefined {
  const n = parseFloat(value.replace(/,/g, ''))
  return Number.isFinite(n) ? n : undefined
}

function parseDollars(value: string): number | undefined {
  const n = parseFloat(value.replace(/,/g, '').replace(/^\$/, ''))
  return Number.isFinite(n) ? n : undefined
}

function periodLengthDays(start: string, end: string): number | undefined {
  if (!start || !end) return undefined
  const startMs = Date.parse(start)
  const endMs = Date.parse(end)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return undefined
  return Math.round((endMs - startMs) / (1000 * 60 * 60 * 24))
}

export function getBillReviewWarnings(
  form: BillFormValues,
  confidence: Record<string, number> = {},
): string[] {
  const warnings: string[] = []
  const gallons = parseGallons(form.waterUsed)
  const billCost = parseDollars(form.billCost)
  const periodDays = periodLengthDays(form.periodStart, form.periodEnd)

  if (gallons != null && gallons > 0 && gallons < MIN_GALLONS) {
    warnings.push(
      `Water usage looks unusually low (${Math.round(gallons).toLocaleString()} gal). Check whether the bill uses thousand gallons or CCF.`,
    )
  }

  if (gallons != null && gallons > MAX_GALLONS) {
    warnings.push(
      `Water usage looks unusually high (${Math.round(gallons).toLocaleString()} gal). Confirm the unit was converted correctly.`,
    )
  }

  if (periodDays != null && periodDays < 0) {
    warnings.push('Billing period end is before the start date. Check the meter read dates on your bill.')
  } else if (periodDays != null && periodDays < MIN_PERIOD_DAYS) {
    warnings.push(`Billing period is only ${periodDays} days. Most water bills cover about 28-35 days.`)
  } else if (periodDays != null && periodDays > MAX_PERIOD_DAYS) {
    warnings.push(`Billing period is ${periodDays} days. Check the read dates on your bill.`)
  }

  if (gallons != null && gallons >= 1000 && billCost != null && billCost > 0 && billCost < 5) {
    warnings.push('Water cost looks low for the usage shown. Use water charges only, not a line item.')
  }

  if (gallons != null && gallons >= 1000 && billCost != null && billCost > 500) {
    warnings.push('Water cost is over $500. Confirm this is water only, not sewer, trash, or total due.')
  }

  const lowConfidenceFields: string[] = []
  if (form.waterUsed && (confidence.waterUsed ?? 1) < 0.88) lowConfidenceFields.push('usage')
  if (form.billCost && (confidence.billCost ?? 1) < 0.88) lowConfidenceFields.push('cost')
  if (form.periodStart && (confidence.periodStart ?? 1) < 0.88) lowConfidenceFields.push('start date')
  if (form.periodEnd && (confidence.periodEnd ?? 1) < 0.88) lowConfidenceFields.push('end date')

  if (lowConfidenceFields.length > 0) {
    warnings.push(`Please double-check the ${lowConfidenceFields.join(', ')}. We are not fully confident in what we read.`)
  }

  return warnings
}
