import { GoogleGenerativeAI } from '@google/generative-ai'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import {
  EXTRACTION_PROMPT,
  assertSupportedBillMime,
  parseBillExtractionJson,
  resolveMimeType,
  type BillExtractionPayload,
} from './bill-extraction.service.js'

export async function extractBillPayloadWithGemini(
  buffer: Buffer,
  mimeType: string,
  _filename = 'bill',
): Promise<BillExtractionPayload> {
  if (!env.geminiApiKey) {
    throw new AppError(503, 'Bill parsing is not configured', 'parse_unavailable')
  }

  const resolvedMime = resolveMimeType(mimeType, buffer)
  assertSupportedBillMime(resolvedMime)

  const genAI = new GoogleGenerativeAI(env.geminiApiKey)
  const model = genAI.getGenerativeModel({
    model: env.geminiBillModel,
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
    },
  })

  let rawJson: string
  try {
    const result = await model.generateContent([
      { text: EXTRACTION_PROMPT },
      {
        inlineData: {
          mimeType: resolvedMime,
          data: buffer.toString('base64'),
        },
      },
    ])
    rawJson = result.response.text()
  } catch (err) {
    console.error('Gemini bill parse failed:', err)
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  if (!rawJson.trim()) {
    throw new AppError(502, 'Could not analyze this bill. Try entering values manually.', 'parse_failed')
  }

  return parseBillExtractionJson(rawJson)
}
