# CLAUDE.md — Codebase Guide

This file describes the architecture, conventions, and workflow of the `puzzle-slider-captcha-random-equation` project for use by AI coding assistants.

---

## Project Purpose

Research implementation of a puzzle slider CAPTCHA with:
- Deterministic randomization via LCG and Mulberry32 PRNGs
- Human behavior detection through pointer trajectory analysis
- Two CAPTCHA modes: **conventional** (linear) and **equation** (non-linear parametric curve)

---

## Monorepo Structure

```
root/
├── backend/      Fastify + TypeScript API server (port 3000)
├── frontend/     React 19 + Vite + Tailwind CSS app (port 5173)
└── package.json  Root orchestrator (concurrently)
```

**Dev command (root):** `npm run dev` — starts both concurrently.

---

## Code Style & Conventions

- **JSDoc on every exported function and class** — describe purpose, params, return value, and any invariants.
- **Inline range comments on magic numbers** — e.g. `// [0.003, 0.010] — quadratic acceleration`
- **Section dividers** with `// ─── Section name ───` for logical grouping inside files.
- **Compact one-liners** for trivial helpers (e.g. `clamp`, `getCoords`).
- **No redundant comments** — comments explain *why*, not *what* the code does.
- All SVG strings are kept inline as template literals; no separate SVG files.
- Backend engine files follow a consistent structure:
  1. Imports
  2. Module-level constants (`BUFFER_PADDING`, `TOTAL_SIZE`)
  3. Exported class with `generate()` then `verify()`
  4. Private helpers at the bottom

---

## Backend

**Entry:** `backend/src/server.ts`
**Runtime:** Node.js + TypeScript via `tsx watch`

### Key Files

| File | Role |
|------|------|
| `src/server.ts` | Fastify server — `GET /challenge`, `POST /verify`; engine registry |
| `src/verify.ts` | `verifyHumanTrajectory()` + `verifyCaptcha()` |
| `src/engines/captcha-engine.ts` | All shared TypeScript interfaces |
| `src/engines/conventional.ts` | `ConventionalEngine` — linear placement |
| `src/engines/equation.ts` | `equationEngine` — parametric curve mode |
| `src/engines/image-generator.ts` | `generateJigsawPath()`, `cropTo16by10()`, `getAllImages()` |
| `src/engines/lcg.ts` | `LCG` class — deterministic PRNG |
| `assets/` | Background images (.jpg/.jpeg/.png) |

### Engine Registry (server.ts)

Engines are stored in a plain object keyed by mode string — adding a new engine requires only one line:

```ts
const engines: Record<string, CaptchaEngine> = {
  conventional: new ConventionalEngine(),
  equation:     new equationEngine(),
};
```

### Interfaces (captcha-engine.ts)

```ts
// Base — all engines return this
interface Challenge {
  id: string; canvasWidth: number;
  backgroundBuffer: Buffer; pieceBuffer: Buffer; initialY: number;
}

interface ConventionalChallenge extends Challenge {
  targetX: number; targetY: number; tolerance: number; // ±5px
}

interface EquationParams {
  x1: number; x2: number; x3: number;     // quadratic curve coefficients
  yAmplitude: number; yFrequency: number; // vertical oscillation
  rotationFactor: number;                 // peak rotation in degrees
}

interface EquationChallenge extends Challenge {
  targetX: number; targetY: number;
  targetT: number;              // slider value (t) that solves the puzzle
  tolerance: number;            // ±1 (tight — slider value check)
  equationParams: EquationParams;
}
```

### Image Constants (image-generator.ts)

- `OUTPUT_WIDTH = 320`, `OUTPUT_HEIGHT = 200` (16:10 canvas)
- `PIECE_SIZE = 50`, `BUFFER_PADDING = 15` → `TOTAL_SIZE = 80px`
- `ASSETS_DIR` = `../../assets` relative to `src/engines/`

### Challenge Lifecycle

1. `GET /challenge?mode=…` → server picks engine, generates `seed = Date.now()`
2. `engine.generate(seed)` returns a `Challenge` with PNG buffers
3. Stored in `activeChallenges: Map<string, ActiveChallenge>` (10-min TTL)
4. Response: `{ id, canvasWidth, background: base64, piece: base64, pieceY, [equationParams] }`
5. `POST /verify` → challenge deleted immediately (single-use), then verified

### Verification Rules (verify.ts)

Human trajectory heuristics (both modes):
- Duration ≥ 150ms
- `trajectory.length` ≥ 3
- Points in ascending time order

Position check per engine:
- **Conventional:** `Math.abs(userX - targetX) <= 5` (pixel position)
- **Equation:** `Math.abs(userX - targetT) <= 1` (slider value t)

### Equation Engine Details (equation.ts)

The parametric curve maps slider value `t` → piece `(x, y, theta)`:

```
j     = x1·t² + x2·t + x3        (abscissa — quadratic)
x     = clamp(j, 0, canvasWidth - pieceSize)
y     = yCenter + yAmplitude · sin(j · yFrequency)
theta = rotationFactor · sin(j · yFrequency)
```

Key design decisions:
- **x2 > 1** → piece moves faster than slider → non-trivial to reverse-engineer
- **targetT** is computed within the "safe zone" before `j` hits the canvas edge (quadratic formula)
- **Piece extracted upright** — CSS `rotate(theta deg)` is applied live on the frontend
- **Shadow bakes `targetTheta`** — the cutout shows the angle the piece must reach
- **Two notches**: real shadow + a random fake shadow ≥ 80px away (same shape, same rotation)
- **Mulberry32** for equation params, **LCG** for image/jigsaw/targetT selection

---

## Frontend

**Entry:** `frontend/src/main.tsx` → `App.tsx` → `SliderCaptcha.tsx`
**Build tool:** Vite (proxies `/challenge` and `/verify` to `localhost:3000`)

### Key Files

| File | Role |
|------|------|
| `src/components/SliderCaptcha.tsx` | UI-only — renders puzzle, slider, status |
| `src/hooks/useCaptcha.ts` | All state, pointer events, piece position derivation |
| `src/services/api.ts` | `fetchChallenge(mode)`, `verifyCaptcha(id, userX, trajectoryData)` |
| `src/types/captcha.ts` | `ChallengeResponse`, `EquationParams`, trajectory types |

### useCaptcha Hook — Exports

```ts
{
  mode, setMode,
  challenge,        // ChallengeResponse | null
  sliderValue,      // number 0–260 (= t in equation mode)
  result,           // "Human" | "Bot" | null
  isLoading, isVerifying,
  loadChallenge,
  onSliderChange, onPointerDown, onPointerMove, onPointerUp,
  pieceX,           // CSS left  (equation: computed; conventional: = sliderValue)
  pieceCurrentY,    // CSS top   (equation: computed; conventional: fixed)
  pieceTheta,       // CSS rotate degrees (equation: live; conventional: 0)
}
```

### Piece Position Derivation

```ts
// Equation mode: compute from equation
const eqPos = computeEquationPos(sliderValue, challenge.equationParams);
pieceX = eqPos.x;  pieceCurrentY = eqPos.y;  pieceTheta = eqPos.theta;

// Conventional mode: linear
pieceX = sliderValue;  pieceCurrentY = challenge.pieceY;  pieceTheta = 0;
```

`computeEquationPos()` in `useCaptcha.ts` **must stay in sync** with `computeEquation()` in `equation.ts`.

### Pointer Flow

1. `onPointerDown` → record `mouseDown { x, y, t }`; reset trajectory buffer
2. `onPointerMove` → append `{ x, y, t }` to buffer
3. `onSliderChange` → update `sliderValue`
4. `onPointerUp` → build `CaptchaTrajectoryData`, client-side human check, then POST to `/verify`

---

## Development Workflow

```bash
npm install && cd backend && npm install && cd ../frontend && npm install && cd ..

npm run dev           # both services
npm run dev:backend   # port 3000
npm run dev:frontend  # port 5173
npm run build
```

---

## Adding a New Engine

1. Create `backend/src/engines/my-engine.ts` implementing `CaptchaEngine`
2. Add `interface MyChallenge extends Challenge` in `captcha-engine.ts`
3. Add one entry to the `engines` map in `server.ts`
4. If the frontend needs new fields, extend `ChallengeResponse` in `types/captcha.ts`

---

## Known Limitations

- No persistent storage — `activeChallenges` is in-memory; restarts clear all sessions.
- No test suite — manual testing via browser.
- CORS is hardcoded to `http://localhost:5173` in `server.ts`.
