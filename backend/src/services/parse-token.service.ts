import { randomUUID } from 'node:crypto'

interface ParseTokenEntry {
  expiresAt: number
}

const tokens = new Map<string, ParseTokenEntry>()
const TOKEN_TTL_MS = 5 * 60 * 1000

export function issueParseToken(): string {
  const token = randomUUID()
  tokens.set(token, { expiresAt: Date.now() + TOKEN_TTL_MS })
  return token
}

export function consumeParseToken(token: string): boolean {
  const entry = tokens.get(token)
  if (!entry) return false
  tokens.delete(token)
  if (Date.now() > entry.expiresAt) return false
  return true
}

setInterval(() => {
  const now = Date.now()
  for (const [token, entry] of tokens.entries()) {
    if (now > entry.expiresAt) tokens.delete(token)
  }
}, 60_000).unref()
