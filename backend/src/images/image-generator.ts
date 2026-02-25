import sharp from "sharp";
import fs from "fs";
import path from "path";
import { LCG } from "../engines/lcg";

export interface GeneratedPuzzle {
  backgroundBuffer: Buffer;
  pieceBuffer: Buffer;
  targetX: number;
  targetY: number;
  canvasWidth: number;
}

const ASSETS_DIR = path.join(__dirname, "../../assets");
const OUTPUT_WIDTH = 320;
const OUTPUT_HEIGHT = 200;
const PIECE_SIZE = 50;

function getAllImages(): string[] {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(ASSETS_DIR);
  return files.filter((file) => /\.(jpg|jpeg|png)$/i.test(file));
}

function generateJigsawPath(lcg: LCG): string {
  let top, right, bottom, left;

  do {
    top = lcg.nextInt(0, 2);
    right = lcg.nextInt(0, 2);
    bottom = lcg.nextInt(0, 2);
    left = lcg.nextInt(0, 2);
  } while (top === 0 && right === 0 && bottom === 0 && left === 0);

  const d = 20;
  let path = `M 0 0 `;

  if (top === 0) {
    path += `L 100 0 `;
  } else {
    const s = top === 1 ? -1 : 1;
    path += `L 35 0 `;
    path += `C 35 0, 35 ${s*d}, 50 ${s*d} `;
    path += `C 65 ${s*d}, 65 0, 65 0 `;
    path += `L 100 0 `;
  }

  if (right === 0) {
    path += `L 100 100 `;
  } else {
    const s = right === 1 ? 1 : -1;
    path += `L 100 35 `;
    path += `C 100 35, ${100+(s*d)} 35, ${100+(s*d)} 50 `;
    path += `C ${100+(s*d)} 65, 100 65, 100 65 `;
    path += `L 100 100 `;
  }

  if (bottom === 0) {
    path += `L 0 100 `;
  } else {
    const s = bottom === 1 ? 1 : -1;
    path += `L 65 100 `;
    path += `C 65 100, 65 ${100+(s*d)}, 50 ${100+(s*d)} `;
    path += `C 35 ${100+(s*d)}, 35 100, 35 100 `;
    path += `L 0 100 `;
  }

  if (left === 0) {
    path += `L 0 0 `;
  } else {
    const s = left === 1 ? -1 : 1;
    path += `L 0 65 `;
    path += `C 0 65, ${s*d} 65, ${s*d} 50 `;
    path += `C ${s*d} 35, 0 35, 0 35 `;
    path += `L 0 0 `;
  }

  path += "Z";
  return path;
}

async function cropTo16by10(imagePath: string): Promise<Buffer> {
  const image = sharp(imagePath);
  const metadata = await image.metadata();

  const width = metadata.width || 0;
  const height = metadata.height || 0;

  const targetRatio = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  const currentRatio = width / height;

  let cropWidth = width;
  let cropHeight = height;
  let left = 0;
  let top = 0;

  if (currentRatio > targetRatio) {
    cropWidth = Math.round(height * targetRatio);
    left = Math.round((width - cropWidth) / 2);
  } else {
    cropHeight = Math.round(width / targetRatio);
    top = Math.round((height - cropHeight) / 2);
  }

  return image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT)
    .toBuffer();
}

export async function generatePuzzle(seed: number): Promise<GeneratedPuzzle> {
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

  const bigMaskSvg = `
    <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
      <path d="${dynamicPath}" fill="white" stroke="none"/>
    </svg>
  `;
  const bigOutlineSvg = `
    <svg width="${TOTAL_SIZE}" height="${TOTAL_SIZE}" viewBox="-30 -30 160 160" xmlns="http://www.w3.org/2000/svg">
      <path d="${dynamicPath}" fill="none" stroke="rgba(255,255,255,0.8)" stroke-width="5"/>
    </svg>
  `;
  const bigShadowSvg = `
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
      { input: Buffer.from(bigMaskSvg), blend: "dest-in" },
      { input: Buffer.from(bigOutlineSvg), blend: "over" }
    ])
    .png()
    .toBuffer();

  const backgroundBuffer = await sharp(fullImageBuffer)
    .composite([{
      input: Buffer.from(bigShadowSvg),
      top: Math.max(0, targetY - BUFFER_PADDING),
      left: Math.max(0, targetX - BUFFER_PADDING),
      blend: "over"
    }])
    .png()
    .toBuffer();

  return {
    backgroundBuffer,
    pieceBuffer,
    targetX: targetX - BUFFER_PADDING,
    targetY: targetY - BUFFER_PADDING,
    canvasWidth: OUTPUT_WIDTH,
  };
}