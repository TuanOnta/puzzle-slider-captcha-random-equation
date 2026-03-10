import sharp from "sharp";
import fs from "fs";
import path from "path";
import { LCG } from "./lcg";

// ─── Canvas constants (shared with frontend) ──────────────────────────────────
export const ASSETS_DIR   = path.join(__dirname, "../../assets");
export const OUTPUT_WIDTH  = 320;
export const OUTPUT_HEIGHT = 200;
export const PIECE_SIZE    = 50; // Logical piece size before padding

// ─── Image helpers ────────────────────────────────────────────────────────────

/**
 * Return all .jpg / .jpeg / .png filenames from the assets directory.
 * Creates the directory if it does not exist yet.
 */
export function getAllImages(): string[] {
  if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
    return [];
  }
  return fs.readdirSync(ASSETS_DIR).filter(f => /\.(jpg|jpeg|png)$/i.test(f));
}

/**
 * Centre-crop an image to a 16:10 aspect ratio and resize to OUTPUT dimensions.
 * Wider images are cropped horizontally; taller images are cropped vertically.
 */
export async function cropTo16by10(imagePath: string): Promise<Buffer> {
  const image = sharp(imagePath);
  const { width = 0, height = 0 } = await image.metadata();

  const targetRatio  = OUTPUT_WIDTH / OUTPUT_HEIGHT;
  const currentRatio = width / height;

  let cropWidth = width, cropHeight = height, left = 0, top = 0;

  if (currentRatio > targetRatio) {
    // Image too wide — trim sides
    cropWidth = Math.round(height * targetRatio);
    left = Math.round((width - cropWidth) / 2);
  } else {
    // Image too tall — trim top/bottom
    cropHeight = Math.round(width / targetRatio);
    top = Math.round((height - cropHeight) / 2);
  }

  return image
    .extract({ left, top, width: cropWidth, height: cropHeight })
    .resize(OUTPUT_WIDTH, OUTPUT_HEIGHT)
    .toBuffer();
}

// ─── Jigsaw path ─────────────────────────────────────────────────────────────

/**
 * Generate a randomised SVG jigsaw path for a 100×100 viewBox.
 * Each of the four edges is independently chosen to be:
 *   0 = flat, 1 = outward notch, 2 = inward notch.
 * The loop guarantees at least one non-flat edge so the piece is never a plain rectangle.
 *
 * The path is drawn in a -30/-30 to 130/130 viewBox so the notch bumps that
 * extend outside the 100×100 square are still fully visible.
 */
export function generateJigsawPath(lcg: LCG): string {
  let top: number, right: number, bottom: number, left: number;

  // Retry until at least one edge has a notch
  do {
    top    = lcg.nextInt(0, 2);
    right  = lcg.nextInt(0, 2);
    bottom = lcg.nextInt(0, 2);
    left   = lcg.nextInt(0, 2);
  } while (top === 0 && right === 0 && bottom === 0 && left === 0);

  const d = 20; // Notch depth in SVG units
  let p = `M 0 0 `;

  // Top edge
  if (top === 0) {
    p += `L 100 0 `;
  } else {
    const s = top === 1 ? -1 : 1;
    p += `L 35 0 C 35 0, 35 ${s*d}, 50 ${s*d} C 65 ${s*d}, 65 0, 65 0 L 100 0 `;
  }

  // Right edge
  if (right === 0) {
    p += `L 100 100 `;
  } else {
    const s = right === 1 ? 1 : -1;
    p += `L 100 35 C 100 35, ${100+s*d} 35, ${100+s*d} 50 C ${100+s*d} 65, 100 65, 100 65 L 100 100 `;
  }

  // Bottom edge
  if (bottom === 0) {
    p += `L 0 100 `;
  } else {
    const s = bottom === 1 ? 1 : -1;
    p += `L 65 100 C 65 100, 65 ${100+s*d}, 50 ${100+s*d} C 35 ${100+s*d}, 35 100, 35 100 L 0 100 `;
  }

  // Left edge
  if (left === 0) {
    p += `L 0 0 `;
  } else {
    const s = left === 1 ? -1 : 1;
    p += `L 0 65 C 0 65, ${s*d} 65, ${s*d} 50 C ${s*d} 35, 0 35, 0 35 L 0 0 `;
  }

  return p + "Z";
}
