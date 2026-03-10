import sharp from "sharp";
import { CaptchaEngine, Challenge, VerificationInput, ConventionalChallenge } from "./captcha-engine";
import { ASSETS_DIR, cropTo16by10, generateJigsawPath, getAllImages, OUTPUT_HEIGHT, OUTPUT_WIDTH, PIECE_SIZE } from "./image-generator";
import { LCG } from "./lcg";
import path from "path";

export class ConventionalEngine implements CaptchaEngine {
  async generate(seed: number, logger?: any): Promise<ConventionalChallenge> {
      const lcg = new LCG(seed);
      const images = getAllImages();
    
      let fullImageBuffer: Buffer;
    
      if (images.length === 0) {
        fullImageBuffer = await sharp({
          create: {
            width: OUTPUT_WIDTH,
            height: OUTPUT_HEIGHT,
            channels: 4,
            background: { r: 100, g: 100, b: 100, alpha: 1 }
          }
        }).png().toBuffer();
      } else {
        const imageIndex = lcg.nextInt(0, images.length - 1);
        const fileName = images[imageIndex];
        fullImageBuffer = await cropTo16by10(path.join(ASSETS_DIR, fileName));
      }
    
      const maxX = OUTPUT_WIDTH - PIECE_SIZE - 20;
      const maxY = OUTPUT_HEIGHT - PIECE_SIZE - 20;
      const minX = OUTPUT_WIDTH / 2;
    
      const targetX = lcg.nextInt(Math.floor(minX), maxX);
      const targetY = lcg.nextInt(20, maxY);
    
      const dynamicPath = generateJigsawPath(lcg);
    
      const BUFFER_PADDING = 15;
      const TOTAL_SIZE = PIECE_SIZE + (BUFFER_PADDING * 2);
    
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
      const ShadowSvg = `
        <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
          <path d="${dynamicPath}" fill="black" fill-opacity="0.6"/>
        </svg>
      `;
    
      const rawPiece = await sharp(fullImageBuffer)
        .extract({
          left: Math.max(0, targetX - BUFFER_PADDING),
          top: Math.max(0, targetY - BUFFER_PADDING),
          width: TOTAL_SIZE,
          height: TOTAL_SIZE
        })
        .toBuffer();
    
      const pieceBuffer = await sharp(rawPiece)
        .composite([
          { input: Buffer.from(MaskSvg), blend: "dest-in" },
          { input: Buffer.from(OutlineSvg), blend: "over" }
        ])
        .png()
        .toBuffer();
    
      const backgroundBuffer = await sharp(fullImageBuffer)
        .composite([{
          input: Buffer.from(ShadowSvg),
          top: Math.max(0, targetY - BUFFER_PADDING),
          left: Math.max(0, targetX - BUFFER_PADDING),
          blend: "over"
        }])
        .png()
        .toBuffer();
    
    return {
      id: crypto.randomUUID(),
      canvasWidth: OUTPUT_WIDTH,
      targetX: targetX - BUFFER_PADDING,
      targetY: targetY - BUFFER_PADDING,
      initialY: targetY - BUFFER_PADDING,
      tolerance: 5,
      backgroundBuffer: backgroundBuffer,
      pieceBuffer: pieceBuffer
    };
  }

  verify(input: VerificationInput, logger?: any): boolean {
    const { id, targetX, tolerance } = input.challenge as ConventionalChallenge;
    logger?.info(`ConventionalEngine: challenge=${id}, userX=${input.userX}, targetX=${targetX}, tolerance=${tolerance}`);
    return Math.abs(input.userX - targetX) <= tolerance;
  }
}
