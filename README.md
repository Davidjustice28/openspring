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
| `VITE_API_URL` | No | Frontend API base (default proxied `/api`) |
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

| Service | Suggested platform |
|---------|-------------------|
| Postgres | Neon |
| Backend | Railway or Render |
| Frontend | Vercel |

Build: `npm run build`  
Backend start: `npm run start -w backend`  
Frontend: deploy `frontend/dist` with `VITE_API_URL` pointing to API.

## Development

```bash
npm run dev          # backend + frontend
npm run build        # build all workspaces
npm run db:generate  # generate new migrations
npm run db:migrate   # apply migrations
npm run db:seed      # seed 51 states
```
