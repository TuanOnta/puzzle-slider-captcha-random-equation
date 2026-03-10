import sharp from "sharp";
import path from "path";
import { CaptchaEngine, EquationChallenge, EquationParams, VerificationInput } from "./captcha-engine";
import { ASSETS_DIR, cropTo16by10, generateJigsawPath, getAllImages, OUTPUT_HEIGHT, OUTPUT_WIDTH, PIECE_SIZE } from "./image-generator";
import { LCG } from "./lcg";

/** x, y position and rotation angle produced by the parametric equation at slider value t. */
export interface EquationOutput { x: number; y: number; theta: number; }

const BUFFER_PADDING = 15;
const TOTAL_SIZE = PIECE_SIZE + BUFFER_PADDING * 2; // 80px

/**
 * Equation-mode puzzle engine.
 *
 * Unlike the conventional engine, the piece does NOT move linearly with the slider.
 * Its position (x, y) and rotation (theta) are driven by a parametric equation:
 *
 *   j     = x1·t² + x2·t + x3        (abscissa mapping — quadratic curve)
 *   x     = clamp(j, 0, canvasWidth)
 *   y     = yCenter + yAmplitude · sin(j · yFrequency)
 *   theta = rotationFactor  · sin(j · yFrequency)
 *
 * The user must find the slider value t (targetT) where the piece visually aligns
 * with the rotated shadow cutout burned into the background.
 *
 * Security features:
 *   - Piece moves faster than the slider (x2 > 1) → non-linear x mapping
 *   - Piece oscillates vertically and rotates as it travels
 *   - A fake decoy notch is added to the background at a random position
 *   - Verification checks the slider value (t), not the pixel position
 */
export class equationEngine implements CaptchaEngine {

  /**
   * Generate a challenge from a numeric seed.
   *
   * Randomness is split between two PRNGs:
   *   - mulberry32(seed): generates the equation params (deterministic curve shape)
   *   - LCG(seed):        picks image, targetT, and jigsaw path
   */
  async generate(seed: number, logger?: any): Promise<EquationChallenge> {
    const params = this.generateParams(seed);
    const lcg = new LCG(seed);

    // Pick a background image, fall back to a grey canvas if assets are missing
    const images = getAllImages();
    const fullImageBuffer = images.length > 0
      ? await cropTo16by10(path.join(ASSETS_DIR, images[lcg.nextInt(0, images.length - 1)]))
      : await sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();

    // ── Safe targetT selection ────────────────────────────────────────────────
    // With aggressive x2 values the quadratic j(t) can exceed the canvas width
    // well before the slider reaches its max. Solve for the exact clamp point:
    //   x1·t² + x2·t + x3 = maxX  →  t = (−x2 + √(x2² + 4·x1·(maxX − x3))) / (2·x1)
    const maxX   = OUTPUT_WIDTH - PIECE_SIZE;
    const clampT = (-params.x2 + Math.sqrt(params.x2 ** 2 + 4 * params.x1 * (maxX - params.x3))) / (2 * params.x1);
    const safeMax = Math.min(240, Math.floor(clampT) - 10);
    const safeMin = Math.max(30, safeMax - 40);
    const targetT = lcg.nextInt(safeMin, safeMax);

    // Compute target pixel position and rotation at the chosen slider value
    const { x: targetX, y: targetY, theta: targetTheta } = this.computeEquation(targetT, params, OUTPUT_WIDTH, OUTPUT_HEIGHT, PIECE_SIZE);
    const tx = Math.round(targetX);
    const ty = Math.round(targetY);

    const dynamicPath = generateJigsawPath(lcg);
    const svgAttrs = `width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg"`;

    // Piece SVGs are upright — CSS handles rotation live on the frontend
    const MaskSvg    = `<svg ${svgAttrs}><path d="${dynamicPath}" fill="white" stroke="none"/></svg>`;
    const OutlineSvg = `<svg ${svgAttrs}><path d="${dynamicPath}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="5"/></svg>`;
    // Shadow bakes the target rotation so the cutout shows the angle the piece must reach
    const ShadowSvg  = `<svg ${svgAttrs}><g transform="rotate(${targetTheta}, 50, 50)"><path d="${dynamicPath}" fill="black" fill-opacity="0.6"/></g></svg>`;

    const pieceLeft = Math.max(0, tx - BUFFER_PADDING);
    const pieceTop  = Math.max(0, ty - BUFFER_PADDING);

    // Extract the piece region upright and apply the jigsaw mask + outline
    const rawPiece = await sharp(fullImageBuffer).extract({ left: pieceLeft, top: pieceTop, width: TOTAL_SIZE, height: TOTAL_SIZE }).toBuffer();
    const pieceBuffer = await sharp(rawPiece)
      .composite([{ input: Buffer.from(MaskSvg), blend: "dest-in" }, { input: Buffer.from(OutlineSvg), blend: "over" }])
      .png().toBuffer();

    // ── Fake decoy notch ──────────────────────────────────────────────────────
    // Generate a second shadow at a random position ≥ 80px from the real one.
    // Both notches look identical; the user must find the correct slider value.
    const maxLeft = OUTPUT_WIDTH  - TOTAL_SIZE;
    const maxTop  = OUTPUT_HEIGHT - TOTAL_SIZE;
    let fakeLeft = pieceLeft, fakeTop = pieceTop;
    for (let i = 0; i < 20; i++) {
      fakeLeft = lcg.nextInt(0, maxLeft);
      fakeTop  = lcg.nextInt(0, maxTop);
      if (Math.sqrt((fakeLeft - pieceLeft) ** 2 + (fakeTop - pieceTop) ** 2) >= 80) break;
    }

    // Composite fake first, real on top — real wins if they overlap
    const backgroundBuffer = await sharp(fullImageBuffer)
      .composite([
        { input: Buffer.from(ShadowSvg), top: fakeTop,  left: fakeLeft,  blend: "over" },
        { input: Buffer.from(ShadowSvg), top: pieceTop, left: pieceLeft, blend: "over" },
      ])
      .png().toBuffer();

    logger?.info(`EquationEngine: targetT=${targetT}, x=${tx}, y=${ty}, theta=${targetTheta.toFixed(2)}`);

    return {
      id: crypto.randomUUID(),
      canvasWidth: OUTPUT_WIDTH,
      targetX: pieceLeft,
      targetY: pieceTop,
      targetT,
      initialY: pieceTop,
      tolerance: 1,
      equationParams: params,
      backgroundBuffer,
      pieceBuffer,
    };
  }

  /**
   * Accept if the user's slider value is within ±tolerance of targetT.
   * The frontend submits the raw slider value as userX.
   */
  verify(input: VerificationInput, logger?: any): boolean {
    const { id, targetT, tolerance } = input.challenge as EquationChallenge;
    logger?.info(`EquationEngine verify: challenge=${id}, userX=${input.userX}, targetT=${targetT}, tolerance=${tolerance}`);
    return Math.abs(input.userX - targetT) <= tolerance;
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  /**
   * Mulberry32 PRNG — faster and higher quality than LCG for floating-point values.
   * Returns a closure that produces floats in [0, 1) on each call.
   */
  private mulberry32(seed: number) {
    return () => {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Clamp value to [min, max]. */
  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  /**
   * Deterministically generate equation parameters from a seed via mulberry32.
   * Ranges are chosen so the curve is visibly dramatic but never exits the canvas:
   *   x1 ∈ [0.003, 0.010]  quadratic acceleration
   *   x2 ∈ [1.5,   2.0]    piece moves faster than slider
   *   x3 ∈ [0,     10]     initial offset
   *   yAmplitude ∈ [25, 50]   vertical swing in pixels
   *   yFrequency ∈ [0.02, 0.06]
   *   rotationFactor ∈ [15, 60]  degrees of rotation at peak
   */
  private generateParams(seed: number): EquationParams {
    const rand = this.mulberry32(seed);
    return {
      x1: 0.003 + rand() * 0.007,
      x2: 1.5   + rand() * 0.5,
      x3: rand() * 10,
      yAmplitude:    25 + rand() * 25,
      yFrequency: 0.02 + rand() * 0.04,
      rotationFactor: 15 + rand() * 45,
    };
  }

  /**
   * Evaluate the parametric equation at slider value t.
   * @param t         Current slider value (0 – MAX_TRAVEL)
   * @param params    Equation parameters from generateParams()
   * @param canvasWidth / canvasHeight / pieceSize — layout constants
   * @returns Clamped (x, y) position and rotation theta in degrees
   */
  private computeEquation(t: number, params: EquationParams, canvasWidth: number, canvasHeight: number, pieceSize: number): EquationOutput {
    const j = params.x1 * t * t + params.x2 * t + params.x3; // abscissa mapping
    const x = this.clamp(j, 0, canvasWidth - pieceSize);
    const y = this.clamp(
      (canvasHeight - pieceSize) / 2 + params.yAmplitude * Math.sin(j * params.yFrequency),
      0, canvasHeight - pieceSize
    );
    const theta = params.rotationFactor * Math.sin(j * params.yFrequency);
    return { x, y, theta };
  }
}
