import sharp from "sharp";
import path from "path";
import { CaptchaEngine, EquationChallenge, EquationParams, VerificationInput } from "./captcha-engine";
import { ASSETS_DIR, cropTo16by10, generateJigsawPath, getAllImages, OUTPUT_HEIGHT, OUTPUT_WIDTH, PIECE_SIZE } from "./image-generator";
import { LCG } from "./lcg";

export interface EquationOutput {
  x: number;
  y: number;
  theta: number;
}

const BUFFER_PADDING = 15;
const TOTAL_SIZE = PIECE_SIZE + BUFFER_PADDING * 2;

export class equationEngine implements CaptchaEngine {
  async generate(seed: number, logger?: any): Promise<EquationChallenge> {
    const params = this.generateParams(seed);
    const lcg = new LCG(seed);
    const images = getAllImages();

    let fullImageBuffer: Buffer;
    if (images.length === 0) {
      fullImageBuffer = await sharp({
        create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } }
      }).png().toBuffer();
    } else {
      const imageIndex = lcg.nextInt(0, images.length - 1);
      fullImageBuffer = await cropTo16by10(path.join(ASSETS_DIR, images[imageIndex]));
    }

    // Find the slider value (t) at which j first hits the right-edge clamp.
    // Solve: x1*t² + x2*t + x3 = (OUTPUT_WIDTH - PIECE_SIZE)
    // → t = (-x2 + sqrt(x2² + 4*x1*(maxX - x3))) / (2*x1)
    const maxX = OUTPUT_WIDTH - PIECE_SIZE;
    const clampT = (-params.x2 + Math.sqrt(params.x2 ** 2 + 4 * params.x1 * (maxX - params.x3))) / (2 * params.x1);
    // Keep targetT well inside the unclamped zone so the piece is still moving at the target.
    // Do NOT force a floor here — with fast x2, clampT can be as low as ~60.
    const safeMax = Math.min(240, Math.floor(clampT) - 10);
    const safeMin = Math.max(30, safeMax - 40);
    const targetT = lcg.nextInt(safeMin, safeMax);
    const targetOutput = this.computeEquation(targetT, params, OUTPUT_WIDTH, OUTPUT_HEIGHT, PIECE_SIZE);
    const targetX = Math.round(targetOutput.x);
    const targetY = Math.round(targetOutput.y);
    const targetTheta = targetOutput.theta;

    const dynamicPath = generateJigsawPath(lcg);

    // Piece is extracted upright — rotation is handled by CSS on the frontend
    const MaskSvg = `
      <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
        <path d="${dynamicPath}" fill="white" stroke="none"/>
      </svg>
    `;
    const OutlineSvg = `
      <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
        <path d="${dynamicPath}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="5"/>
      </svg>
    `;
    // Shadow bakes the target rotation so the cutout shows the angle the piece must reach
    const ShadowSvg = `
      <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
        <g transform="rotate(${targetTheta}, 50, 50)">
          <path d="${dynamicPath}" fill="black" fill-opacity="0.6"/>
        </g>
      </svg>
    `;

    // Extract piece upright at target position
    const rawPiece = await sharp(fullImageBuffer)
      .extract({
        left: Math.max(0, targetX - BUFFER_PADDING),
        top: Math.max(0, targetY - BUFFER_PADDING),
        width: TOTAL_SIZE,
        height: TOTAL_SIZE,
      })
      .toBuffer();

    // Apply upright jigsaw mask + outline
    const pieceBuffer = await sharp(rawPiece)
      .composite([
        { input: Buffer.from(MaskSvg), blend: "dest-in" },
        { input: Buffer.from(OutlineSvg), blend: "over" },
      ])
      .png()
      .toBuffer();

    // Generate a fake notch at a random position at least 80px from the real one
    const realLeft = Math.max(0, targetX - BUFFER_PADDING);
    const realTop  = Math.max(0, targetY - BUFFER_PADDING);
    const maxLeft  = OUTPUT_WIDTH  - TOTAL_SIZE;
    const maxTop   = OUTPUT_HEIGHT - TOTAL_SIZE;

    let fakeLeft = realLeft;
    let fakeTop  = realTop;
    for (let i = 0; i < 20; i++) {
      fakeLeft = lcg.nextInt(0, maxLeft);
      fakeTop  = lcg.nextInt(0, maxTop);
      const dist = Math.sqrt((fakeLeft - realLeft) ** 2 + (fakeTop - realTop) ** 2);
      if (dist >= 80) break;
    }

    // Apply both shadow cutouts — fake first so real always renders on top
    const backgroundBuffer = await sharp(fullImageBuffer)
      .composite([
        { input: Buffer.from(ShadowSvg), top: fakeTop,  left: fakeLeft,  blend: "over" },
        { input: Buffer.from(ShadowSvg), top: realTop,  left: realLeft,  blend: "over" },
      ])
      .png()
      .toBuffer();

    logger?.info(`EquationEngine: targetT=${targetT}, targetX=${targetX}, targetY=${targetY}, theta=${targetTheta.toFixed(2)}`);

    return {
      id: crypto.randomUUID(),
      canvasWidth: OUTPUT_WIDTH,
      targetX: targetX - BUFFER_PADDING,
      targetY: targetY - BUFFER_PADDING,
      targetT,
      initialY: Math.max(0, targetY - BUFFER_PADDING),
      tolerance: 10,
      equationParams: params,
      backgroundBuffer,
      pieceBuffer,
    };
  }

  verify(input: VerificationInput, logger?: any): boolean {
    const { id, targetT, tolerance } = input.challenge as EquationChallenge;
    logger?.info(`EquationEngine verify: challenge=${id}, userX=${input.userX}, targetT=${targetT}, tolerance=${tolerance}`);
    return Math.abs(input.userX - targetT) <= tolerance;
  }

  private mulberry32(seed: number) {
    return function () {
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  private clamp(value: number, min: number, max: number) {
    return Math.max(min, Math.min(max, value));
  }

  private generateParams(seed: number): EquationParams {
    const rand = this.mulberry32(seed);
    return {
      x1: 0.003 + rand() * 0.007,      // [0.003, 0.010] — quadratic acceleration
      x2: 1.5  + rand() * 1.5,         // [1.5,   3.0]  — piece moves faster than slider
      x3: rand() * 10,                  // [0,     10]   — initial offset
      yAmplitude:    25 + rand() * 25,  // [25,    50]   — dramatic vertical swing
      yFrequency: 0.02 + rand() * 0.04, // [0.02,  0.06] — multiple visible oscillations
      rotationFactor: 15 + rand() * 45,  // [15,    60]   — pronounced rotation
    };
  }

  private computeEquation(
    t: number,
    params: EquationParams,
    canvasWidth: number,
    canvasHeight: number,
    pieceSize: number
  ): EquationOutput {
    const j = params.x1 * t * t + params.x2 * t + params.x3;
    const x = this.clamp(j, 0, canvasWidth - pieceSize);
    const yCenter = (canvasHeight - pieceSize) / 2;
    const y = this.clamp(
      yCenter + params.yAmplitude * Math.sin(j * params.yFrequency),
      0,
      canvasHeight - pieceSize
    );
    const theta = params.rotationFactor * Math.sin(j * params.yFrequency);
    return { x, y, theta };
  }
}
