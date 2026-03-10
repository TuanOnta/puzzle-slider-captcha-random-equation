// ─── Core shared types for all CAPTCHA engines ───────────────────────────────

/** Base challenge data returned by every engine. */
export interface Challenge {
  id: string;
  canvasWidth: number;
  backgroundBuffer: Buffer; // Background image with shadow cutout(s)
  pieceBuffer: Buffer;      // Puzzle piece image
  initialY: number;         // Piece Y position at slider = 0
}

/** Conventional engine: piece placed at a fixed random (x, y) target. */
export interface ConventionalChallenge extends Challenge {
  targetX: number;   // Pixel X the user must reach
  targetY: number;
  tolerance: number; // Allowed error in pixels
}

/** Equation parameters that define the non-linear trajectory curve. */
export interface EquationParams {
  x1: number;          // Quadratic coefficient  — controls acceleration
  x2: number;          // Linear coefficient     — controls base speed vs slider
  x3: number;          // Constant offset
  yAmplitude: number;  // Vertical oscillation amplitude in pixels
  yFrequency: number;  // Frequency of the sine wave along the x-axis
  rotationFactor: number; // Max rotation angle in degrees
}

/** Equation engine: piece follows a parametric curve driven by slider value t. */
export interface EquationChallenge extends Challenge {
  targetX: number;
  targetY: number;
  targetT: number;          // Slider value (t) that solves the puzzle
  tolerance: number;
  equationParams: EquationParams; // Sent to frontend to animate the piece
}

// ─── Trajectory types ────────────────────────────────────────────────────────

/** A single pointer event sample: position + timestamp. */
export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number; // Unix ms
}

/** Full drag gesture captured on the frontend. */
export interface CaptchaTrajectoryData {
  mouseDown: TrajectoryPoint;
  mouseUp: TrajectoryPoint;
  trajectory: TrajectoryPoint[]; // Intermediate points during drag
}

// ─── Engine interface ─────────────────────────────────────────────────────────

export interface VerificationInput {
  challenge: Challenge | ConventionalChallenge | EquationChallenge;
  userX: number;
  trajectoryData?: CaptchaTrajectoryData;
}

/** Contract every CAPTCHA engine must implement. */
export interface CaptchaEngine {
  /** Generate a new challenge from a numeric seed (server-controlled). */
  generate(seed: number, logger?: any): Promise<Challenge>;
  /** Return true if the user's answer is correct. */
  verify(input: VerificationInput, logger?: any): boolean;
}
