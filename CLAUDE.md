# CLAUDE.md — Codebase Guide

This file describes the architecture, conventions, and workflow of the `puzzle-slider-captcha-random-equation` project for use by AI coding assistants.

---

## Project Purpose

Research implementation of a puzzle slider CAPTCHA with:
- Deterministic randomization via LCG (Linear Congruential Generator)
- Human behavior detection through pointer trajectory analysis
- A planned equation-based non-linear trajectory engine

---

## Monorepo Structure

```
root/
├── backend/      Fastify + TypeScript API server (port 3000)
├── frontend/     React 19 + Vite + Tailwind CSS app (port 5173)
└── package.json  Root orchestrator using concurrently
```

**Dev command (root):** `npm run dev` — starts both concurrently.

---

## Backend

**Entry:** `backend/src/server.ts`
**Runtime:** Node.js + TypeScript via `tsx watch`

### Key Files

| File | Role |
|------|------|
| `src/server.ts` | Fastify server, routes: `GET /challenge`, `POST /verify` |
| `src/verify.ts` | `verifyHumanTrajectory()` + `verifyCaptcha()` — shared verification logic |
| `src/engines/captcha-engine.ts` | Core TypeScript interfaces |
| `src/engines/conventional.ts` | `ConventionalEngine` — current working engine |
| `src/engines/equation.ts` | `EquationEngine` — skeleton, not yet functional |
| `src/engines/image-generator.ts` | `generateJigsawPath()`, `cropTo16by10()`, `getAllImages()` |
| `src/engines/lcg.ts` | `LCG` class — deterministic PRNG |
| `assets/` | Background images (.jpg/.jpeg/.png) |

### Interfaces (captcha-engine.ts)

```ts
interface Challenge {
  id: string;
  canvasWidth: number;         // 320px
  backgroundBuffer: Buffer;
  pieceBuffer: Buffer;
  initialY: number;
}

interface ConventionalChallenge extends Challenge {
  targetX: number;
  targetY: number;
  tolerance: number;           // ±5px
}

interface CaptchaTrajectoryData {
  mouseDown: TrajectoryPoint;
  mouseUp: TrajectoryPoint;
  trajectory: TrajectoryPoint[];
}

interface TrajectoryPoint { x: number; y: number; t: number; }

interface CaptchaEngine {
  generate(seed: number, logger?: any): Promise<Challenge>;
  verify(input: VerificationInput, logger?: any): boolean;
}
```

### Image Constants (image-generator.ts)

- `OUTPUT_WIDTH` = 320, `OUTPUT_HEIGHT` = 200 (16:10 crop)
- `PIECE_SIZE` = 50, buffer padding = 15 → effective region: 80×80px
- `ASSETS_DIR` = `../assets` relative to `src/engines/`

### Challenge Lifecycle

1. Server creates seed = `Date.now()`
2. Engine `generate(seed)` → `Challenge` object (buffers in memory)
3. Stored in `activeChallenges: Map<string, { challenge, engine, expiresAt }>` (10-min TTL)
4. Returned to client as `{ background: base64, piece: base64, pieceY, ... }`
5. On `POST /verify` → fetched from map, **deleted immediately** (single-use), then verified

### Verification Rules (verify.ts)

Human trajectory must satisfy:
- Duration (`mouseUp.t - mouseDown.t`) ≥ 150ms
- `trajectory.length` ≥ 3
- All trajectory points in ascending time order

Position check (conventional engine):
- `Math.abs(userX - targetX) <= tolerance` (tolerance = 5px)

---

## Frontend

**Entry:** `frontend/src/main.tsx` → `App.tsx` → `SliderCaptcha.tsx`
**Build tool:** Vite (proxies `/challenge` and `/verify` to `localhost:3000`)

### Key Files

| File | Role |
|------|------|
| `src/components/SliderCaptcha.tsx` | UI-only component — renders puzzle, slider, status |
| `src/hooks/useCaptcha.ts` | All state + pointer event logic |
| `src/services/api.ts` | `fetchChallenge(mode)`, `verifyCaptcha(id, userX, trajectoryData)` |
| `src/types/captcha.ts` | `ChallengeResponse`, `VerifyResponse`, `TrajectoryPoint`, `CaptchaTrajectoryData` |

### Slider Constants (defined in useCaptcha.ts, exported)

```ts
CANVAS_WIDTH = 320
PUZZLE_WIDTH = 60
HANDLE_WIDTH = 48
MAX_TRAVEL = 260        // slider input range max (CANVAS_WIDTH - PUZZLE_WIDTH)
SLIDER_MAX_TRAVEL = 272 // visual handle travel (CANVAS_WIDTH - HANDLE_WIDTH)
```

### useCaptcha Hook — Exports

```ts
{
  mode, setMode,
  challenge,            // ChallengeResponse | null
  sliderValue,          // number (0–260)
  result,               // "Human" | "Bot" | null
  isLoading,
  isVerifying,
  loadChallenge,        // () => void
  onSliderChange,       // (e: ChangeEvent<HTMLInputElement>) => void
  onPointerDown,        // (e: PointerEvent) => void
  onPointerMove,        // (e: PointerEvent) => void
  onPointerUp,          // () => void
}
```

### Pointer Flow in useCaptcha

1. `onPointerDown` → stores `mouseDown: { x, y, t }` in ref
2. `onPointerMove` → pushes `{ x, y, t }` to `trajectoryRef`
3. `onSliderChange` → updates `sliderValue` state
4. `onPointerUp` → builds `CaptchaTrajectoryData`, runs local human check, then calls `verifyCaptcha()`

### API Base URL

`http://localhost:3000` — defined in `frontend/src/services/api.ts`.
Vite proxy in `vite.config.ts` forwards `/challenge` and `/verify` to backend.

---

## Development Workflow

```bash
# Install all deps
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..

# Start dev (both services)
npm run dev

# Individual services
npm run dev:backend      # tsx watch src/server.ts  → port 3000
npm run dev:frontend     # vite                      → port 5173

# Build
npm run build
```

No test suite exists yet. Manual testing via browser at `http://localhost:5173`.

---

## Adding a New Engine

1. Create `backend/src/engines/my-engine.ts` implementing `CaptchaEngine`
2. Add a new `interface MyChallenge extends Challenge` in `captcha-engine.ts`
3. Register the engine in `server.ts` where `ConventionalEngine` is instantiated (based on `mode` query param)
4. No frontend changes needed unless the UI needs new fields from the challenge response

---

## Known Limitations / In-Progress

- `EquationEngine` (`equation.ts`) — `generate()` returns `null`, `verify()` returns `false`. It's a skeleton.
- No persistent storage — `activeChallenges` Map is in-memory; restarts clear all active sessions.
- No test suite.
- CORS is hardcoded to `http://localhost:5173` in `server.ts`.
