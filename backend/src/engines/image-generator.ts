import sharp from "sharp";
import fs from "fs";
import path from "path";
import { LCG } from "./lcg";

export interface GeneratedPuzzle {
  backgroundBuffer: Buffer;
  pieceBuffer: Buffer;
  targetX: number;
  targetY: number;
  canvasWidth: number;
}

export const ASSETS_DIR = path.join(__dirname, "../../assets");
export const OUTPUT_WIDTH = 320;
export const OUTPUT_HEIGHT = 200;
export const PIECE_SIZE = 50;

export function getAllImages(): string[] {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    return [];
  }
  const files = fs.readdirSync(ASSETS_DIR);
  return files.filter((file) => /\.(jpg|jpeg|png)$/i.test(file));
}

export function generateJigsawPath(lcg: LCG): string {
  let top, right, bottom, left, total :number;

  do {
    top = lcg.nextInt(0, 2);
    right = lcg.nextInt(0, 2);
    bottom = lcg.nextInt(0, 2);
    left = lcg.nextInt(0, 2);
    total = top + right + bottom + left;
  } while (top === 0 && right === 0 && bottom === 0 && left === 0 && total !== 4 && total !== 0);

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

export async function cropTo16by10(imagePath: string): Promise<Buffer> {
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