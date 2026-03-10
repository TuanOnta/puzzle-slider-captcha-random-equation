import sharp from "sharp";
import path from "path";
import { CaptchaEngine, VerificationInput, ConventionalChallenge } from "./captcha-engine";
import { ASSETS_DIR, cropTo16by10, generateJigsawPath, getAllImages, OUTPUT_HEIGHT, OUTPUT_WIDTH, PIECE_SIZE } from "./image-generator";
import { LCG } from "./lcg";

const BUFFER_PADDING = 15;
const TOTAL_SIZE = PIECE_SIZE + BUFFER_PADDING * 2; // 80px — includes notch overflow

/**
 * Standard puzzle-slider engine.
 * Places a jigsaw-shaped piece at a random (x, y) position in the right half
 * of the canvas. The user must drag the slider until the piece aligns with the
 * shadow cutout. Verification checks pixel-level x position (±5 px tolerance).
 */
export class ConventionalEngine implements CaptchaEngine {

  /**
   * Generate a puzzle challenge from a numeric seed.
   * Uses LCG for reproducible randomness: image selection → target position → jigsaw shape.
   */
  async generate(seed: number, logger?: any): Promise<ConventionalChallenge> {
    const lcg = new LCG(seed);

    // Pick a background image, fall back to a grey canvas if assets are missing
    const images = getAllImages();
    const fullImageBuffer = images.length > 0
      ? await cropTo16by10(path.join(ASSETS_DIR, images[lcg.nextInt(0, images.length - 1)]))
      : await sharp({ create: { width: OUTPUT_WIDTH, height: OUTPUT_HEIGHT, channels: 4, background: { r: 100, g: 100, b: 100, alpha: 1 } } }).png().toBuffer();

    // Target is placed in the right half so the user must drag a meaningful distance
    const targetX = lcg.nextInt(Math.floor(OUTPUT_WIDTH / 2), OUTPUT_WIDTH - PIECE_SIZE - 20);
    const targetY = lcg.nextInt(20, OUTPUT_HEIGHT - PIECE_SIZE - 20);

    const dynamicPath = generateJigsawPath(lcg);

    // SVG layers composited onto the piece / background
    const svgAttrs = `width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg"`;
    const MaskSvg    = `<svg ${svgAttrs}><path d="${dynamicPath}" fill="white" stroke="none"/></svg>`;
    const OutlineSvg = `<svg ${svgAttrs}><path d="${dynamicPath}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="5"/></svg>`;
    const ShadowSvg  = `<svg ${svgAttrs}><path d="${dynamicPath}" fill="black" fill-opacity="0.6"/></svg>`;

    const pieceLeft = Math.max(0, targetX - BUFFER_PADDING);
    const pieceTop  = Math.max(0, targetY - BUFFER_PADDING);

    // Crop the raw piece region then apply jigsaw mask + outline
    const rawPiece = await sharp(fullImageBuffer).extract({ left: pieceLeft, top: pieceTop, width: TOTAL_SIZE, height: TOTAL_SIZE }).toBuffer();
    const pieceBuffer = await sharp(rawPiece)
      .composite([{ input: Buffer.from(MaskSvg), blend: "dest-in" }, { input: Buffer.from(OutlineSvg), blend: "over" }])
      .png().toBuffer();

    // Burn the shadow cutout into the background at the target position
    const backgroundBuffer = await sharp(fullImageBuffer)
      .composite([{ input: Buffer.from(ShadowSvg), top: pieceTop, left: pieceLeft, blend: "over" }])
      .png().toBuffer();

    logger?.info(`ConventionalEngine: targetX=${targetX}, targetY=${targetY}`);

    return {
      id: crypto.randomUUID(),
      canvasWidth: OUTPUT_WIDTH,
      targetX: pieceLeft,
      targetY: pieceTop,
      initialY: pieceTop,
      tolerance: 5,
      backgroundBuffer,
      pieceBuffer,
    };
  }

  /**
   * Accept if the user's slider position is within ±tolerance pixels of targetX.
   * userX is the raw slider value, which equals the piece's CSS left position.
   */
  verify(input: VerificationInput, logger?: any): boolean {
    const { id, targetX, tolerance } = input.challenge as ConventionalChallenge;
    logger?.info(`ConventionalEngine verify: challenge=${id}, userX=${input.userX}, targetX=${targetX}, tolerance=${tolerance}`);
    return Math.abs(input.userX - targetX) <= tolerance;
  }
}
