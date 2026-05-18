# SafeVision Web — Operator UI

Next.js 15 (App Router) + TypeScript + Tailwind CSS.

The same codebase ships **two runtime modes**:

- **Demo mode** (`NEXT_PUBLIC_DEMO_MODE=true`) — frontend-only, runs on Vercel. WebRTC pairs phones, YOLOv8n inference runs in a Web Worker via `onnxruntime-web`, incidents persist to IndexedDB. No backend required.
- **Connected mode** (default when `NEXT_PUBLIC_API_URL` is set) — talks to the Python services in `services/` over HTTP and WebSocket.

## Routes

| Path | Purpose |
|---|---|
| `/` | Overview — KPI strip, live tiles, activity stream |
| `/cameras` | Camera grid + QR-pairing modal |
| `/cameras/[id]/live` | Full-screen live feed + detection overlay + active rules / incidents sidebar |
| `/cameras/[id]/zones` | Polygon zone editor (overlaid on the camera's last thumbnail) |
| `/incidents` | Filterable incident list with detail drawer + thumbnails |
| `/rules` | Browser-side rule editor — create / edit / disable detection rules |
| `/configure` | Chat-based rule builder via OpenRouter |
| `/publish/[peer]` | Mobile publisher page — the phone scans the pairing QR and lands here |
| `/login` | Auth — includes a "Try the demo" skip button when demo mode is on |

## Environment

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_DEMO_MODE` | `true` (on Vercel) | Forces demo mode regardless of API URLs |
| `NEXT_PUBLIC_API_URL` | (empty) | Incident Service base URL (connected mode) |
| `NEXT_PUBLIC_RULES_API_URL` | (empty) | Rule Engine base URL |
| `NEXT_PUBLIC_PEER_HOST` | `0.peerjs.com` | PeerJS signaling broker |
| `NEXT_PUBLIC_PEER_PORT` | `443` | |
| `NEXT_PUBLIC_PEER_SECURE` | `true` | |
| `OPENROUTER_API_KEY` | — | Server-side only. Powers `/api/configure-rule`. |

## Develop

```bash
npm install --legacy-peer-deps
NEXT_PUBLIC_DEMO_MODE=true npm run dev    # http://localhost:3000

npm run lint
npm run type-check
npm run test                              # vitest — unit (rule evaluator)
npm run test:e2e                          # playwright — demo-mode smoke
```

## Production build

```bash
npm run build
npm start
```

## Docker

```bash
docker build -f web/app/Dockerfile -t safevision-web web/app
docker run -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=http://incident:8004 \
  -e NEXT_PUBLIC_RULES_API_URL=http://rule-engine:8003 \
  safevision-web
```

## Project layout

```
app/
  layout.tsx              # Root HTML, sidebar + topbar via AppShell
  page.tsx                # Overview (KPI strip + live tiles + activity stream)
  cameras/
    page.tsx              # Camera grid + pair modal
    [id]/live/page.tsx    # Live viewer + inference overlay
    [id]/zones/page.tsx   # Zone editor
  incidents/page.tsx      # Filterable list + detail drawer
  rules/page.tsx          # Rule CRUD
  configure/page.tsx      # LLM chat rule builder
  publish/[peer]/page.tsx # Mobile publisher (WebRTC)
  login/page.tsx          # Login form + demo skip
  api/
    health/route.ts
    configure-rule/route.ts  # OpenRouter proxy

components/
  AppShell.tsx            # Sidebar + topbar layout
  Sidebar.tsx
  TopBar.tsx
  PairCameraModal.tsx     # QR + PeerJS receiver setup
  LiveCameraView.tsx      # WebRTC consumer + inference + overlay
  SeverityBadge.tsx
  StatusBadge.tsx

lib/
  env.ts                  # Runtime env / demo-mode flag
  api.ts                  # HTTP client for connected mode + shared types
  auth.ts                 # JWT cookie helpers
  demo-auth.ts            # Demo-session token minter
  webrtc/peer.ts          # PeerJS wrappers
  webrtc/receiver.ts
  inference/
    classes.ts            # COCO 80-class labels + palette
    client.ts             # Worker host (main thread side)
    worker.ts             # onnxruntime-web + letterbox + NMS (web worker)
    types.ts              # Detection + Worker message types
    nms.ts                # Class-aware NMS
    overlay.ts            # Canvas overlay renderer
  rules/
    evaluator.ts          # Stateful rule evaluator (duration + cooldown)
    recorder.ts           # Records matched rules as incidents + thumbnail
  stores/
    cameras.ts            # Zustand + localStorage
    incidents.ts          # Zustand + IndexedDB (thumbnails)
    rules.ts
    session.ts

tests/
  unit/evaluator.test.ts  # vitest
  e2e/demo.spec.ts        # playwright (demo mode happy path)
```
