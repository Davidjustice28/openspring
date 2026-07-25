import type { Request } from 'express'

export function getClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === '1') {
    const forwarded = req.headers['x-forwarded-for']
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? req.ip
  }
  return req.ip ?? 'unknown'
}
