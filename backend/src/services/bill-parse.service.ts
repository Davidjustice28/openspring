import pdf from 'pdf-parse/lib/pdf-parse.js'
import { STATE_BY_ABBR, US_STATES, type ParsedBillFields } from '@openspring/shared'
import { env } from '../config/env.js'
import { parseBillWithOpenAI } from './bill-openai.service.js'

function extractAmount(text: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].replace(/,/g, '')
  }
  return undefined
}

function extractDate(text: string): string | undefined {
  const match = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/)
  if (!match) return undefined
  const raw = match[1]
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const parts = raw.split(/[\/\-]/)
  if (parts.length !== 3) return undefined
  let [a, b, c] = parts.map(Number)
  if (c < 100) c += 2000
  if (a > 12) [a, b] = [b, a]
  return `${c}-${String(a).padStart(2, '0')}-${String(b).padStart(2, '0')}`
}

function extractZip(text: string): string | undefined {
  const match = text.match(/\b(\d{5})(?:-\d{4})?\b/)
  return match?.[1]
}

function extractState(text: string): string | undefined {
  for (const state of US_STATES) {
    if (text.includes(state.name)) return state.name
  }
  const abbrMatch = text.match(/\b([A-Z]{2})\b/g)
  if (abbrMatch) {
    for (const abbr of abbrMatch) {
      if (STATE_BY_ABBR[abbr]) return STATE_BY_ABBR[abbr].name
    }
  }
  return undefined
}

function extractCity(text: string): string | undefined {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  for (const line of lines.slice(0, 20)) {
    const cityState = line.match(/^([A-Za-z\s.'-]+),\s*([A-Z]{2})\s+\d{5}/)
    if (cityState) return cityState[1].trim()
  }
  return undefined
}

async function parseBillWithRegex(
  buffer: Buffer,
  mimeType: string,
): Promise<{ parsed: ParsedBillFields; confidence: Record<string, number> }> {
  let text = ''
  if (mimeType === 'application/pdf' || buffer.slice(0, 4).toString() === '%PDF') {
    const result = await pdf(buffer)
    text = result.text
  } else {
    return { parsed: {}, confidence: {} }
  }

  const waterUsed = extractAmount(text, [
    /(?:water\s*used|usage|consumption|gallons?)[:\s]*([\d,]+(?:\.\d+)?)/i,
    /([\d,]+(?:\.\d+)?)\s*(?:gal|gallons?)/i,
  ])
  const billCost = extractAmount(text, [
    /(?:total|amount\s*due|balance)[:\s]*\$?\s*([\d,]+(?:\.\d{2})?)/i,
    /\$\s*([\d,]+(?:\.\d{2})?)/,
  ])
  const periodStart = extractDate(text)
  const zip = extractZip(text)
  const state = extractState(text)
  const city = extractCity(text)

  const parsed: ParsedBillFields = {
    waterUsed,
    billCost,
    periodStart,
    periodEnd: periodStart,
    zip,
    state,
    city,
  }

  const confidence: Record<string, number> = {}
  if (waterUsed) confidence.waterUsed = 0.7
  if (billCost) confidence.billCost = 0.7
  if (periodStart) confidence.periodStart = 0.6
  if (zip) confidence.zip = 0.8
  if (state) confidence.state = 0.8
  if (city) confidence.city = 0.6

  return { parsed, confidence }
}

export async function parseBillBuffer(
  buffer: Buffer,
  mimeType: string,
  filename = 'bill',
): Promise<{ parsed: ParsedBillFields; confidence: Record<string, number> }> {
  if (env.openaiApiKey) {
    return parseBillWithOpenAI(buffer, mimeType, filename)
  }

  return parseBillWithRegex(buffer, mimeType)
}
