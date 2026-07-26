import type { ParsedBillFields } from '@openspring/shared'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import { extractBillPayloadWithGemini } from './bill-gemini.service.js'
import { extractBillPayloadWithOpenAI } from './bill-openai.service.js'
import { mapExtractionToParsed, type BillExtractionPayload } from './bill-extraction.service.js'

export async function extractBillPayload(
  buffer: Buffer,
  mimeType: string,
  filename = 'bill',
): Promise<BillExtractionPayload> {
  if (env.geminiApiKey) {
    return extractBillPayloadWithGemini(buffer, mimeType, filename)
  }
  if (env.openaiApiKey) {
    return extractBillPayloadWithOpenAI(buffer, mimeType, filename)
  }
  throw new AppError(503, 'Bill parsing is not configured', 'parse_unavailable')
}

export async function parseBillWithVision(
  buffer: Buffer,
  mimeType: string,
  filename = 'bill',
): Promise<{ parsed: ParsedBillFields; confidence: Record<string, number> }> {
  const payload = await extractBillPayload(buffer, mimeType, filename)
  return mapExtractionToParsed(payload)
}

export { mapExtractionToParsed } from './bill-extraction.service.js'
export type { BillExtractionPayload } from './bill-extraction.service.js'
