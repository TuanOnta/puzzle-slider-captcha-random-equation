// equation.ts

export interface EquationParams {
  x1: number; // quadratic coefficient
  x2: number; // linear coefficient
  x3: number; // offset
  yAmplitude: number;
  yFrequency: number;
  rotationFactor: number;
}

export interface EquationOutput {
  x: number;
  y: number;
  theta: number;
}

function mulberry32(seed: number) {
  return function () {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Generate deterministic equation parameters from seed
 */
export function generateParams(seed: number): EquationParams {
  const rand = mulberry32(seed);

  return {
    x1: rand() * 0.0015,            // small quadratic term
    x2: 1 + rand() * 0.2,           // near linear
    x3: rand() * 5,                 // small offset
    yAmplitude: 10 + rand() * 10,   // vertical amplitude (10–20)
    yFrequency: 0.01 + rand() * 0.02,
    rotationFactor: 2 + rand() * 4  // 2–6 degrees influence
  };
}

/**
 * Main compute function
 */
export function computeEquation(
  t: number,
  params: EquationParams,
  canvasWidth: number,
  canvasHeight: number,
  pieceSize: number
): EquationOutput {

  // --- 1. Abscissa mapping
  const j =
    params.x1 * t * t +
    params.x2 * t +
    params.x3;

  // --- 2. Horizontal offset
  let x = j;

  // Clamp horizontal
  x = clamp(x, 0, canvasWidth - pieceSize);

  // --- 3. Vertical correction
  const yCenter = (canvasHeight - pieceSize) / 2;
  const y =
    yCenter +
    params.yAmplitude *
      Math.sin(j * params.yFrequency);

  // Clamp vertical
  const clampedY = clamp(y, 0, canvasHeight - pieceSize);

  // --- 4. Rotation
  const theta =
    params.rotationFactor *
    Math.sin(j * params.yFrequency);

  return {
    x,
    y: clampedY,
    theta
  };
}