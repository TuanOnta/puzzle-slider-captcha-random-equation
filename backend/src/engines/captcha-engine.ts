export interface Challenge {
  id: string;
  canvasWidth: number;
  backgroundBuffer: Buffer;
  pieceBuffer: Buffer;
  initialY: number;
}

export interface ConventionalChallenge extends Challenge {
  targetX: number;
  targetY: number;
  tolerance: number;
}

export interface EquationParams {
  x1: number;
  x2: number;
  x3: number;
  yAmplitude: number;
  yFrequency: number;
  rotationFactor: number;
}

export interface EquationChallenge extends Challenge {
  targetX: number;
  targetY: number;
  targetT: number;
  tolerance: number;
  equationParams: EquationParams;
}

export interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

export interface CaptchaTrajectoryData {
  mouseDown: TrajectoryPoint;
  mouseUp: TrajectoryPoint;
  trajectory: TrajectoryPoint[];
}

export interface VerificationInput {
  challenge: Challenge | ConventionalChallenge | EquationChallenge;
  userX: number;
  trajectoryData?: CaptchaTrajectoryData;
}

export interface CaptchaEngine {
  generate(seed: number, logger?: any): Promise<Challenge>;
  verify(input: VerificationInput, logger?: any): boolean;
}
