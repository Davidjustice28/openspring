import OpenAI from 'openai'
import { env } from '../config/env.js'
import { AppError } from '../lib/errors.js'
import {
  EXTRACTION_PROMPT,
  assertSupportedBillMime,
  parseBillExtractionJson,
  resolveMimeType,
  type BillExtractionPayload,
} from './bill-extraction.service.js'

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

  return [
    {
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${base64}`,
        detail: 'high',
      },
    },
  ]
}

export async function extractBillPayloadWithOpenAI(
  buffer: Buffer,
  mimeType: string,
  filename = 'bill',
): Promise<BillExtractionPayload> {
  if (!env.openaiApiKey) {
    throw new AppError(503, 'Bill parsing is not configured', 'parse_unavailable')
  }

  const resolvedMime = resolveMimeType(mimeType, buffer)
  assertSupportedBillMime(resolvedMime)

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
      max_tokens: 900,
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

  return parseBillExtractionJson(rawJson)
}
