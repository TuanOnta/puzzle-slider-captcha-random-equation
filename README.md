# Puzzle Slider CAPTCHA with Random Equation

A research-oriented implementation of a puzzle slider CAPTCHA system enhanced with non-linear trajectory mapping and deterministic randomization (LCG-based) to improve resistance against automated bot attacks.

---

## Overview

This project implements a drag-to-fit puzzle CAPTCHA where the user slides a jigsaw-shaped piece into the correct position on a background image. Human behavior is verified through trajectory analysis — checking that the mouse/touch interaction follows natural human movement patterns (duration, point count, temporal ordering).

The system is designed around two CAPTCHA modes:
- **Conventional** — Standard puzzle slider with random jigsaw piece placement
- **Equation** *(in development)* — Puzzle slider with non-linear trajectory mapping using deterministic equations

---

## Tech Stack

### Monorepo (Root)
| Tool | Purpose |
|------|---------|
| [concurrently](https://github.com/open-cli-tools/concurrently) | Run frontend and backend dev servers in parallel |

### Backend
| Tool | Version | Purpose |
|------|---------|---------|
| [Fastify](https://fastify.dev) | ^5.7.4 | HTTP server framework |
| [@fastify/cors](https://github.com/fastify/fastify-cors) | ^11.2.0 | CORS support |
| [Sharp](https://sharp.pixelplumbing.com) | ^0.34.5 | Image processing (crop, mask, composite) |
| [pino-pretty](https://github.com/pinojs/pino-pretty) | ^13.1.3 | Dev log formatting |
| [tsx](https://github.com/privatenumber/tsx) | ^4.21.0 | Run TypeScript directly in Node.js |
| TypeScript | ^5.9.3 | Type safety |

### Frontend
| Tool | Version | Purpose |
|------|---------|---------|
| [React](https://react.dev) | ^19.2.0 | UI framework |
| [Vite](https://vitejs.dev) | ^7.3.1 | Build tool and dev server |
| [Tailwind CSS](https://tailwindcss.com) | ^4.2.0 | Utility-first styling |
| [Axios](https://axios-http.com) | ^1.13.5 | HTTP client |
| TypeScript | ^5.9.3 | Type safety |

---

## Project Structure

```
puzzle-slider-captcha-random-equation/
├── backend/
│   ├── assets/                          # Background images for puzzles
│   └── src/
│       ├── engines/
│       │   ├── captcha-engine.ts        # Interfaces (Challenge, CaptchaEngine, etc.)
│       │   ├── conventional.ts          # Conventional puzzle engine
│       │   ├── equation.ts              # Equation-based engine (in development)
│       │   ├── image-generator.ts       # Jigsaw path generation, image cropping
│       │   └── lcg.ts                   # Linear Congruential Generator (PRNG)
│       ├── server.ts                    # Fastify server — /challenge and /verify routes
│       └── verify.ts                    # Human trajectory validation logic
├── frontend/
│   └── src/
│       ├── components/
│       │   └── SliderCaptcha.tsx        # Main CAPTCHA UI component
│       ├── hooks/
│       │   └── useCaptcha.ts            # State + pointer event logic
│       ├── services/
│       │   └── api.ts                   # API calls to backend
│       └── types/
│           └── captcha.ts               # Shared TypeScript interfaces
├── docs/
├── experiments/
└── package.json                         # Root — dev/build scripts via concurrently
```

---

## Getting Started

### Prerequisites
- Node.js >= 18
- npm

### Install

```bash
# From the root
npm install
cd backend && npm install
cd ../frontend && npm install
```

### Development

```bash
# Run both frontend (port 5173) and backend (port 3000) concurrently
npm run dev

# Or run individually
npm run dev:backend
npm run dev:frontend
```

### Build

```bash
npm run build
```

---

## How It Works

### 1. Challenge Generation

When the page loads, the frontend calls `GET /challenge?mode=conventional`:

1. Backend generates a seed from `Date.now()`
2. **LCG** (Linear Congruential Generator) uses the seed to deterministically:
   - Pick a random background image from `backend/assets/`
   - Generate a random jigsaw path (SVG Bezier curves per edge)
   - Select a random target position (`targetX`, `targetY`)
3. **Sharp** composites three layers:
   - Puzzle piece — masked to jigsaw shape with white outline
   - Background — same image with shadow at piece cutout
4. Both images are returned as base64-encoded PNGs

### 2. User Interaction

The user drags the slider to move the puzzle piece horizontally:
- `onPointerDown` — records start position and timestamp
- `onPointerMove` — accumulates trajectory points `{ x, y, t }`
- `onPointerUp` — triggers verification

### 3. Verification

Verification is **two-layered**:

**Client-side (pre-check):**
- Duration ≥ 150ms
- At least 3 trajectory points
- Points in temporal order

**Server-side (`POST /verify`):**
- Same trajectory checks
- Position check: `Math.abs(userX - targetX) <= 5px`

Challenges are stored in an in-memory `Map` with a 10-minute TTL and are single-use.

---

## API Reference

### `GET /challenge`

**Query params:** `mode=conventional|equation`

**Response:**
```json
{
  "id": "uuid",
  "canvasWidth": 320,
  "background": "<base64 PNG>",
  "piece": "<base64 PNG>",
  "pieceY": 74
}
```

### `POST /verify`

**Body:**
```json
{
  "id": "uuid",
  "userX": 185,
  "trajectoryData": {
    "mouseDown": { "x": 0, "y": 140, "t": 1700000000000 },
    "mouseUp":   { "x": 185, "y": 142, "t": 1700000000800 },
    "trajectory": [
      { "x": 20, "y": 141, "t": 1700000000100 }
    ]
  }
}
```

**Response:**
```json
{ "success": true }
```

---

## Key Design Decisions

- **LCG for reproducible randomness** — seeds are server-controlled, so the browser cannot predict or reconstruct the target position
- **In-memory challenge store** — no database needed; challenges expire after 10 minutes and are deleted on first use
- **Dual trajectory validation** — client-side check prevents unnecessary network requests; server-side check prevents bypassing
- **Engine interface abstraction** — `CaptchaEngine` interface allows swapping in new engines (e.g., equation-based) without changing the server

---

## Roadmap

- [x] Conventional puzzle slider engine
- [x] Human trajectory validation
- [x] Jigsaw SVG path generation with randomized edge shapes
- [ ] Equation-based non-linear trajectory engine
- [ ] Analytics / bot detection statistics
- [ ] Persistent challenge storage (Redis)
