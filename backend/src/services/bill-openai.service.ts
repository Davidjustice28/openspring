import OpenAI from 'openai'
import { z } from 'zod'
import { STATE_BY_ABBR, STATE_BY_NAME, US_STATES, type ParsedBillFields } from '@openspring/shared'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'

const extractionSchema = z.object({
  waterUsed: z.union([z.string(), z.number(), z.null()]).optional(),
  billCost: z.union([z.string(), z.number(), z.null()]).optional(),
  periodStart: z.union([z.string(), z.null()]).optional(),
  periodEnd: z.union([z.string(), z.null()]).optional(),
  city: z.union([z.string(), z.null()]).optional(),
  state: z.union([z.string(), z.null()]).optional(),
  zip: z.union([z.string(), z.number(), z.null()]).optional(),
})

const EXTRACTION_PROMPT = `Extract water utility bill fields from this document for anonymous regional water research.

Return JSON with exactly these keys (use null when unknown):
- waterUsed: gallons used this billing period as a string without commas (convert CCF or HCF to gallons by multiplying by 748)
- billCost: total amount due in dollars as a string like "89.32" without a dollar sign
- periodStart: billing period start as YYYY-MM-DD
- periodEnd: billing period end as YYYY-MM-DD
- city: service address city
- state: US state full name
- zip: 5-digit ZIP code

Rules:
- Only include values clearly visible on the bill
- Do not guess or infer missing values
- Ignore account numbers, customer names, and payment barcodes
- Prefer the total water charge period, not meter read dates from prior years`

function resolveMimeType(mimeType: string, buffer: Buffer): string {
  if (mimeType === 'application/pdf' || buffer.slice(0, 4).toString() === '%PDF') {
    return 'application/pdf'
  }
  if (mimeType.startsWith('image/')) return mimeType
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg'
  if (buffer.slice(0, 4).toString() === '\x89PNG') return 'image/png'
  if (buffer.slice(0, 4).toString() === 'RIFF' && buffer.slice(8, 12).toString() === 'WEBP') return 'image/webp'
  return mimeType
}

function buildDocumentContent(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): OpenAI.Chat.Completions.ChatCompletionContentPart[] {
  const base64 = buffer.toString('base64')

  if (mimeType === 'application/pdf') {
    return [
      {
        type: 'file',
        file: {
          filename: filename.toLowerCase().endsWith('.pdf') ? filename : 'bill.pdf',
          file_data: `data:application/pdf;base64,${base64}`,
        },
      },
    ]
  }

  if (mimeType.startsWith('image/')) {
    return [
      {
        type: 'image_url',
        image_url: {
          url: `data:${mimeType};base64,${base64}`,
          detail: 'low',
        },
      },
    ]
  }

  throw new AppError(400, 'Upload a PDF or image (JPG, PNG, WEBP)', 'unsupported_file_type')
}

function asString(value: string | number | null | undefined): string | undefined {
  if (value == null) return undefined
  const trimmed = String(value).trim()
  return trimmed || undefined
}

function normalizeDate(value: string | null | undefined): string | undefined {
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

function normalizeBillCost(value: string | number | null | undefined): string | undefined {
  const raw = asString(value)?.replace(/^\$/, '').replace(/,/g, '')
  if (!raw) return undefined
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0) return undefined
  return raw
}

function normalizeWaterUsed(value: string | number | null | undefined): string | undefined {
  const raw = asString(value)?.replace(/,/g, '')
  if (!raw) return undefined
  const gallons = Number(raw)
  if (!Number.isFinite(gallons) || gallons <= 0) return undefined
  return raw
}

export async function parseBillWithOpenAI(
  buffer: Buffer,
  mimeType: string,
  filename = 'bill',
): Promise<{ parsed: ParsedBillFields; confidence: Record<string, number> }> {
  if (!env.openaiApiKey) {
    throw new AppError(503, 'Bill parsing is not configured', 'parse_unavailable')
  }

  const resolvedMime = resolveMimeType(mimeType, buffer)
  const openai = new OpenAI({ apiKey: env.openaiApiKey })

  let completion: OpenAI.Chat.Completions.ChatCompletion
  try {
    completion = await openai.chat.completions.create({
      model: env.openaiBillModel,
      messages: [
        {
          role: 'user',
          content: [...buildDocumentContent(buffer, resolvedMime, filename), { type: 'text', text: EXTRACTION_PROMPT }],
        },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 500,
      temperature: 0,
    })
  } catch (err) {
    console.error('OpenAI bill parse failed:', err)
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  const rawJson = completion.choices[0]?.message?.content
  if (!rawJson) {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawJson)
  } catch {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  const extracted = extractionSchema.safeParse(payload)
  if (!extracted.success) {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  const data = extracted.data
  const parsed: ParsedBillFields = {}
  const confidence: Record<string, number> = {}

  const assign = (key: keyof ParsedBillFields, value: string | undefined) => {
    if (!value) return
    parsed[key] = value
    confidence[key] = 0.85
  }

  assign('waterUsed', normalizeWaterUsed(data.waterUsed))
  assign('billCost', normalizeBillCost(data.billCost))
  assign('periodStart', normalizeDate(data.periodStart))
  assign('periodEnd', normalizeDate(data.periodEnd))
  assign('city', asString(data.city))
  assign('state', normalizeState(data.state))
  assign('zip', normalizeZip(data.zip))

  return { parsed, confidence }
}
