import './load-env.js'

function requireEnv(name: string, optional = false): string {
  const value = process.env[name]
  if (!value && !optional) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value ?? ''
}

export const env = {
  port: Number(process.env.PORT ?? 3001),
  databaseUrl: process.env.DATABASE_URL ?? '',
  censusApiKey: requireEnv('CENSUS_API_KEY', true),
  usgsApiKey: requireEnv('USGS_API_KEY', true),
  resendApiKey: requireEnv('RESEND_API_KEY', true),
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? 'notifications@yourdomain.com',
  trustProxy: process.env.TRUST_PROXY === '1',
  geoIpDefaultState: process.env.GEOIP_DEFAULT_STATE ?? '',
  openStatesApiKey: requireEnv('OPEN_STATES_API_KEY', true),
  nassApiKey: requireEnv('NASS_API_KEY', true),
  snapshotSecret: requireEnv('SNAPSHOT_SECRET', true),
  snapshotIngestOnStartup: process.env.SNAPSHOT_INGEST_ON_STARTUP === '1',
  openaiApiKey: requireEnv('OPENAI_API_KEY', true),
  openaiBillModel: process.env.OPENAI_BILL_MODEL ?? 'gpt-4o-mini',
  geminiApiKey: requireEnv('GEMINI_API_KEY', true),
  geminiBillModel: process.env.GEMINI_BILL_MODEL ?? 'gemini-flash-lite-latest',
}
