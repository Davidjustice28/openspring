import fs from 'fs'
import path from 'path'
import type { ParsedBillFields } from '@openspring/shared'
import { extractBillPayload, mapExtractionToParsed } from '../services/bill-openai.service.js'

interface BillFixture {
  name: string
  filePath: string
  mimeType: string
  expected: Partial<ParsedBillFields>
}

const FIXTURES: BillFixture[] = [
  {
    name: 'Sandy UT (tiered thousand-gal)',
    filePath: '/Users/david/Downloads/Sandy.pdf',
    mimeType: 'application/pdf',
    expected: {
      waterUsed: '3000',
      billCost: '33.70',
      periodStart: '2023-07-09',
      periodEnd: '2023-08-07',
      city: 'Sandy',
      state: 'Utah',
      zip: '84070',
    },
  },
  {
    name: 'Salt Lake City (CCF + gallons)',
    filePath:
      '/Users/david/.cursor/projects/Users-david-Programming-projects-openspring/assets/Screenshot_2026-07-25_at_8.10.51_PM-4d06c549-06db-41fa-9f75-2f0db85e9eb8.png',
    mimeType: 'image/png',
    expected: {
      waterUsed: '30668',
      billCost: '192.85',
      periodStart: '2025-05-08',
      periodEnd: '2025-06-07',
      state: 'Utah',
    },
  },
  {
    name: 'Cumming GA (CCF + gallons)',
    filePath: '/Users/david/Downloads/Water-Bill-Example_4-14-2021-1.pdf',
    mimeType: 'application/pdf',
    expected: {
      waterUsed: '2992',
      billCost: '11.88',
      periodStart: '2021-03-25',
      periodEnd: '2021-04-08',
      city: 'Cumming',
      state: 'Georgia',
      zip: '30040',
    },
  },
]

function compareField(field: keyof ParsedBillFields, actual?: string, expected?: string): string {
  if (!expected) return 'skip'
  if (actual === expected) return 'pass'
  return `FAIL expected "${expected}" got "${actual ?? ''}"`
}

async function runFixture(fixture: BillFixture, attempt: number) {
  if (!fs.existsSync(fixture.filePath)) {
    return { attempt, error: `missing file: ${fixture.filePath}` }
  }

  const buffer = fs.readFileSync(fixture.filePath)
  const payload = await extractBillPayload(buffer, fixture.mimeType, path.basename(fixture.filePath))
  const { parsed } = mapExtractionToParsed(payload)

  const results: Record<string, string> = {}
  for (const key of Object.keys(fixture.expected) as (keyof ParsedBillFields)[]) {
    results[key] = compareField(key, parsed[key], fixture.expected[key])
  }

  return { attempt, payload, parsed, results }
}

async function main() {
  const runs = Number(process.argv[2] ?? 1)
  console.log(`Bill parse eval — ${runs} run(s) per fixture`)
  console.log(`Model: ${process.env.OPENAI_BILL_MODEL ?? 'gpt-4o-mini'}\n`)

  let totalChecks = 0
  let passedChecks = 0

  for (const fixture of FIXTURES) {
    console.log(`=== ${fixture.name} ===`)
    for (let attempt = 1; attempt <= runs; attempt++) {
      try {
        const result = await runFixture(fixture, attempt)
        if ('error' in result && result.error) {
          console.log(`  run ${attempt}: ${result.error}`)
          continue
        }
        console.log(`  run ${attempt}:`)
        console.log('    raw:', JSON.stringify(result.payload))
        console.log('    parsed:', JSON.stringify(result.parsed))
        console.log('    checks:', result.results)
        for (const status of Object.values(result.results ?? {})) {
          if (status === 'skip') continue
          totalChecks++
          if (status === 'pass') passedChecks++
        }
      } catch (err) {
        console.log(`  run ${attempt}: ERROR`, err instanceof Error ? err.message : err)
      }
    }
    console.log('')
  }

  if (totalChecks > 0) {
    const pct = Math.round((passedChecks / totalChecks) * 100)
    console.log(`Score: ${passedChecks}/${totalChecks} checks passed (${pct}%)`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
