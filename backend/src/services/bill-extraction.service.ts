import { z } from 'zod'
import { STATE_BY_ABBR, STATE_BY_NAME, US_STATES, type ParsedBillFields } from '@openspring/shared'
import { AppError } from '../lib/errors.js'

export const extractionSchema = z.object({
  previousReadDate: z.union([z.string(), z.null()]).optional(),
  presentReadDate: z.union([z.string(), z.null()]).optional(),
  periodStart: z.union([z.string(), z.null()]).optional(),
  periodEnd: z.union([z.string(), z.null()]).optional(),
  city: z.union([z.string(), z.null()]).optional(),
  state: z.union([z.string(), z.null()]).optional(),
  zip: z.union([z.string(), z.number(), z.null()]).optional(),
  gallonsUsed: z.union([z.string(), z.number(), z.null()]).optional(),
  thousandGallonsUsed: z.union([z.string(), z.number(), z.null()]).optional(),
  ccfUsed: z.union([z.string(), z.number(), z.null()]).optional(),
  usageValue: z.union([z.string(), z.number(), z.null()]).optional(),
  usageUnit: z.union([z.string(), z.null()]).optional(),
  waterChargesTotal: z.union([z.string(), z.number(), z.null()]).optional(),
  waterUsed: z.union([z.string(), z.number(), z.null()]).optional(),
  billCost: z.union([z.string(), z.number(), z.null()]).optional(),
})

export type BillExtractionPayload = z.infer<typeof extractionSchema>

export const EXTRACTION_PROMPT = `You extract fields from a household WATER utility bill. Formats differ — read labels on THIS bill only.

Return JSON with these keys (use null if not clearly visible):

{
  "previousReadDate": "YYYY-MM-DD",
  "presentReadDate": "YYYY-MM-DD",
  "periodStart": "YYYY-MM-DD",
  "periodEnd": "YYYY-MM-DD",
  "city": "service address city",
  "state": "full US state name",
  "zip": "5-digit ZIP from service address",
  "gallonsUsed": number if bill prints total gallons for the period (e.g. "2992 gallons", "30,668 Gallons"),
  "thousandGallonsUsed": number if bill prints thousand-gallon total (e.g. "7" beside "thousand of gallons used"),
  "ccfUsed": number if bill prints CCF/HCF/100 cubic feet consumed for the period (NOT meter register digits),
  "waterChargesTotal": sum of water charges this period only (number, no $)
}

EXTRACTION STEPS (follow in order):

1) PERIOD DATES
- Find "Previous Reading Date" / "Present Reading Date", or read dates, or service period from–to near meter info.
- Put the earlier date in previousReadDate and the later in presentReadDate.
- Copy the year exactly as printed (e.g. 2025, not 2024).
- NEVER use: due date, bill date, statement date, "pay before", or invent a calendar month.

2) USAGE (fill every field that appears — do not convert units)
- gallonsUsed: total if explicitly labeled gallons/gals for the period (e.g. "Gallons Used this period: 2992", "30,668 Gallons").
- thousandGallonsUsed: number beside "thousand of gallons used" / TGAL / KGL (7 → seven thousand gallons).
- ccfUsed: labeled CCF/HCF/cubic feet consumed OR billing units in 100 cu ft (e.g. "4 CCF", "41" units × 100 cu ft).
- Meter register readings (1825→1829, 0140729, 00670) are NOT usage — never put them in usage fields.
- When both gallons AND CCF appear, fill BOTH from their labels.

3) WATER COST
- waterChargesTotal = water subtotal for this period (base + tier/block usage lines).
- Include only water charges. Exclude sewer, trash, storm, street lights, franchise, interest, penalties, past due, payments, total amount due.

4) ADDRESS
- city/state/zip from SERVICE address. Ignore utility remittance/lockbox address at bottom.

Do not guess. Use null when uncertain.`

export function resolveMimeType(mimeType: string, buffer: Buffer): string {
  if (mimeType === 'application/pdf' || buffer.slice(0, 4).toString() === '%PDF') {
    return 'application/pdf'
  }
  if (mimeType.startsWith('image/')) return mimeType
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer.slice(0, 4).toString() === '\x89PNG') return 'image/png'
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  return mimeType
}

export function assertSupportedBillMime(mimeType: string): void {
  if (mimeType === 'application/pdf' || mimeType.startsWith('image/')) return
  throw new AppError(400, 'Upload a PDF or image (JPG, PNG, WEBP)', 'unsupported_file_type')
}

export function asString(value: string | number | null | undefined): string | undefined {
  if (value == null) return undefined
  const trimmed = String(value).trim()
  return trimmed || undefined
}

export function asNumber(value: string | number | null | undefined): number | undefined {
  const raw = asString(value)?.replace(/,/g, '').replace(/^\$/, '')
  if (!raw) return undefined
  const n = Number(raw)
  return Number.isFinite(n) ? n : undefined
}

export function normalizeDate(value: string | null | undefined): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const slashMatch = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (!slashMatch) return undefined

  let month = Number(slashMatch[1])
  let day = Number(slashMatch[2])
  let year = Number(slashMatch[3])
  if (year < 100) year += 2000
  if (month > 12) [month, day] = [day, month]

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function normalizeState(value: string | null | undefined): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  if (STATE_BY_NAME[raw]) return raw

  const abbr = raw.toUpperCase()
  if (STATE_BY_ABBR[abbr]) return STATE_BY_ABBR[abbr].name

  const match = US_STATES.find((state) => state.name.toLowerCase() === raw.toLowerCase())
  return match?.name
}

function normalizeZip(value: string | number | null | undefined): string | undefined {
  const raw = asString(value)
  if (!raw) return undefined
  return raw.match(/\d{5}/)?.[0]
}

export function normalizeBillCost(value: string | number | null | undefined): string | undefined {
  const amount = asNumber(value)
  if (amount == null || amount < 0) return undefined
  return amount.toFixed(2)
}

function normalizeUsageUnit(unit: string | null | undefined): string {
  const raw = asString(unit)?.toLowerCase().replace(/[\s._-]/g, '') ?? 'unknown'
  if (['gal', 'gallon', 'gallons', 'gals'].includes(raw)) return 'gallons'
  if (['ccf', 'hcf', 'centumcubicfeet', 'hundredcubicfeet', 'centumcf'].includes(raw)) return 'ccf'
  if (['kgal', 'thousandgallons', 'thousandgal', 'tgals', 'tgal', '1000gal'].includes(raw)) {
    return 'thousand_gallons'
  }
  if (['liter', 'liters', 'litre', 'litres'].includes(raw)) return 'liters'
  if (['cubicfeet', 'cuft', 'ft3', 'cft'].includes(raw)) return 'cubic_feet'
  return raw
}

function convertUsageToGallons(value: string | number | null | undefined, unit: string | null | undefined): number | undefined {
  const amount = asNumber(value)
  if (amount == null || amount <= 0) return undefined

  switch (normalizeUsageUnit(unit)) {
    case 'gallons':
      return Math.round(amount)
    case 'thousand_gallons':
      return Math.round(amount * 1000)
    case 'ccf':
      return Math.round(amount * 748)
    case 'liters':
      return Math.round(amount * 0.264172)
    case 'cubic_feet':
      return Math.round(amount * 7.48052)
    default:
      return undefined
  }
}

export function resolveUsageGallons(data: BillExtractionPayload): string | undefined {
  const fromThousand = asNumber(data.thousandGallonsUsed)
  const thousandGallons = fromThousand != null && fromThousand > 0 ? Math.round(fromThousand * 1000) : undefined

  const fromCcfRaw = asNumber(data.ccfUsed)
  const fromCcf = fromCcfRaw != null && fromCcfRaw > 0 ? Math.round(fromCcfRaw * 748) : undefined

  const directGallons = asNumber(data.gallonsUsed)
  const direct = directGallons != null && directGallons > 0 ? Math.round(directGallons) : undefined

  const legacy = convertUsageToGallons(data.usageValue, data.usageUnit)
  const legacyDirect = asNumber(data.waterUsed)

  if (thousandGallons != null) return String(thousandGallons)
  if (fromCcf != null && (direct == null || direct < 500 || fromCcf > direct * 1.25)) return String(fromCcf)
  if (direct != null && direct >= 500) return String(direct)
  if (fromCcf != null) return String(fromCcf)
  if (direct != null && direct > 0) return String(direct)
  if (legacy != null && legacy > 0) return String(legacy)
  if (legacyDirect != null && legacyDirect > 0) return String(Math.round(legacyDirect))

  return undefined
}

export function resolvePeriod(data: BillExtractionPayload): { start?: string; end?: string } {
  const fromReads = {
    start: normalizeDate(data.previousReadDate),
    end: normalizeDate(data.presentReadDate),
  }
  if (fromReads.start && fromReads.end) return fromReads

  return {
    start: normalizeDate(data.periodStart),
    end: normalizeDate(data.periodEnd),
  }
}

export function parseBillExtractionJson(raw: string): BillExtractionPayload {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i)
  const jsonText = fenced ? fenced[1].trim() : trimmed

  let payload: unknown
  try {
    payload = JSON.parse(jsonText)
  } catch {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  const extracted = extractionSchema.safeParse(payload)
  if (!extracted.success) {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  return extracted.data
}

export function mapExtractionToParsed(data: BillExtractionPayload): {
  parsed: ParsedBillFields
  confidence: Record<string, number>
} {
  const parsed: ParsedBillFields = {}
  const confidence: Record<string, number> = {}

  const assign = (key: keyof ParsedBillFields, value: string | undefined, score = 0.85) => {
    if (!value) return
    parsed[key] = value
    confidence[key] = score
  }

  const waterUsed = resolveUsageGallons(data)
  const billCost = normalizeBillCost(data.waterChargesTotal) ?? normalizeBillCost(data.billCost)
  const period = resolvePeriod(data)

  const usageScore =
    data.gallonsUsed != null || data.thousandGallonsUsed != null || data.ccfUsed != null ? 0.92 : 0.75
  const costScore = data.waterChargesTotal != null ? 0.92 : 0.75
  const periodScore = data.previousReadDate || data.presentReadDate ? 0.9 : 0.8

  assign('waterUsed', waterUsed, usageScore)
  assign('billCost', billCost, costScore)
  assign('periodStart', period.start, periodScore)
  assign('periodEnd', period.end, periodScore)
  assign('city', asString(data.city))
  assign('state', normalizeState(data.state))
  assign('zip', normalizeZip(data.zip))

  return { parsed, confidence }
}
