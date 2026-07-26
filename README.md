# OpenSpring

No-signup water data transparency platform. Explore public water, climate, census, and geography data by U.S. state, and optionally contribute anonymous household usage.

## Stack

- **Frontend:** React, Vite, Tailwind, TanStack Query, Recharts, react-simple-maps
- **Backend:** Node.js, Express, TypeScript
- **Database:** Neon Postgres + Drizzle ORM
- **APIs:** U.S. Census ACS, TIGERweb, Open-Meteo, USGS NWDC, USGS OGC (waterdata.usgs.gov)
- **Email:** Resend (optional, for state update subscriptions)

## Prerequisites

- Node.js 20+
- Neon Postgres database
- [Census API key](https://api.census.gov/data/key_signup.html) (recommended)
- [USGS API key](https://api.waterdata.usgs.gov/signup/) (recommended for environmental snapshot cards)
- [Resend API key](https://resend.com) (optional, for email signup)
- [OpenAI API key](https://platform.openai.com) (optional fallback for bill upload parsing)
- [Google Gemini API key](https://aistudio.google.com/apikey) (recommended for bill upload parsing)

## Setup

```bash
npm install
cp .env.example .env
# Edit .env with DATABASE_URL, CENSUS_API_KEY, etc.

npm run db:migrate
npm run db:seed
npm run dev
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

## Environment variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon Postgres connection string |
| `CENSUS_API_KEY` | Recommended | Census ACS API key |
| `USGS_API_KEY` | Recommended | USGS OGC API key (higher rate limits for environmental cards) |
| `RESEND_API_KEY` | For email | Resend API key |
| `RESEND_FROM_EMAIL` | For email | Sender address |
| `PORT` | No | Backend port (default 3001) |
| `VITE_API_URL` | Local only | Frontend API base for Vite dev (default proxied `/api`). Omit in production. |
| `FRONTEND_DIST` | No | Path to Vite build output (default `frontend/dist`) |
| `GEMINI_API_KEY` | For bill upload | Preferred bill parser (default `gemini-flash-lite-latest`) |
| `GEMINI_BILL_MODEL` | No | Override Gemini bill parser model |
| `OPENAI_API_KEY` | For bill upload | Fallback bill parser (`gpt-4o-mini`) |
| `OPENAI_BILL_MODEL` | No | Override OpenAI bill parser model |

Run bill parser regression tests (requires fixture files + `GEMINI_API_KEY` or `OPENAI_API_KEY`):

```bash
npm run bill:eval -w backend        # once per fixture
npm run bill:eval -w backend -- 3   # 3 runs (checks consistency)
```

| `TRUST_PROXY` | Production | Set to `1` behind Railway/Render |

## API routes

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/states` | List all states |
| GET | `/api/dashboard?state=` | Combined dashboard payload |
| GET | `/api/states/:slug` | State profile slice |
| GET | `/api/census/:slug` | Census data |
| GET | `/api/weather/:slug` | Weather data |
| GET | `/api/water/:slug` | USGS water data |
| POST | `/api/bills/parse` | Parse bill → prefilled fields + parseToken (file discarded) |
| POST | `/api/contributions` | Submit anonymous contribution |
| POST | `/api/subscriptions` | Email + state update signup |

## Privacy

- **No accounts**: browse and contribute without signing up
- **Email optional**: only for state water update notifications
- **Contributions are anonymous**: only aggregate counts shown publicly
- **Bill files never stored**: parsed in memory, then discarded

## Deployment

One Node service serves both the API and the built React app (same origin). Postgres stays on Neon.

| Service | Suggested platform |
|---------|-------------------|
| Postgres | Neon |
| Web (API + frontend) | Render |

### Render (single web service)

1. Push this repo and create a **Web Service** (or use Blueprint with `render.yaml`).
2. Build command: `npm install && npm run build`
3. Start command: `npm run start`
4. Health check path: `/api/health`
5. Set env vars from `.env.example` (`DATABASE_URL`, `TRUST_PROXY=1`, API keys). Do **not** set `VITE_API_URL` — the browser calls relative `/api`.
6. After the first deploy, run migrations/seed once (Render shell or locally against the same `DATABASE_URL`):

```bash
npm run db:migrate
npm run db:seed
```

Local production check:

```bash
npm run build
npm run start
# open http://localhost:3001
```

## Development

```bash
npm run dev          # backend + frontend
npm run build        # build all workspaces
npm run db:generate  # generate new migrations
npm run db:migrate   # apply migrations
npm run db:seed      # seed 51 states
```
