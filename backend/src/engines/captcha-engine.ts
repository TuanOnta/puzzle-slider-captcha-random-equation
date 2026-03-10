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

export interface EquationChallenge extends Challenge {
  targetX: number;
  targetY: number;
  tolerance: number;
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
