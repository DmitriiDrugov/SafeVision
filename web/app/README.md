# SafeVision Web — Configuration UI

Next.js 14 (App Router) + TypeScript + Tailwind CSS.

The UI is the primary touch point for safety managers and floor supervisors. It contains:

- **Live Incident Dashboard** (`/`) — Real-time feed of violations via WebSocket from the Notification Service.
- **Incidents** (`/incidents`) — Filterable, paginated incident history with acknowledgement workflow.
- **Rules** (`/rules`) — List/edit/enable rules. Each rule shows last-triggered time and trigger count.
- **Configure** (`/configure`) — Chat-based rule builder powered by OpenRouter (Llama 3.1 8B).

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:8004` | Incident Service base URL |
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8005/ws/incidents` | Notification Service WebSocket |
| `OPENROUTER_API_KEY` | — | Server-side only. Used by `/api/configure-rule`. |

## Development

```bash
npm install
npm run dev          # http://localhost:3000
npm run lint
npm run type-check
npm run test
```

## Production Build

```bash
npm run build
npm start
```

## Docker

```bash
# Build context is web/app/
docker build -f web/app/Dockerfile -t safevision-web web/app
docker run -p 3000:3000 safevision-web
```

## Project Layout

```
app/                # Next.js App Router pages
  layout.tsx        # Root HTML layout, nav
  page.tsx          # Dashboard (default page)
  incidents/page.tsx
  rules/page.tsx
  configure/page.tsx
components/         # Reusable React components (TODO)
lib/
  api.ts            # Typed REST client for backend services
  websocket.ts      # WebSocket client for live incident feed
```

## Notes

- All API types should mirror the Pydantic models in `shared/schemas/`. Consider generating
  TypeScript types from the OpenAPI spec exposed by the Incident Service.
- Avoid `any`. ESLint is configured with `@typescript-eslint/strict-type-checked`.
