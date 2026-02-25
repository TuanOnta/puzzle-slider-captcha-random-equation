export interface Challenge {
  id: string;
  canvasWidth: number;
}

export interface ConventionalChallenge extends Challenge {
  targetX: number;
  targetY: number;
  tolerance: number;
  backgroundBuffer: Buffer;
  pieceBuffer: Buffer;
}

export interface VerificationInput {
  challenge: Challenge | ConventionalChallenge;
  userX: number;
  trajectory?: { x: number; t: number }[];
}

export interface CaptchaEngine {
  generate(seed: number, logger?: any): Promise<Challenge>;
  verify(input: VerificationInput, logger?: any): boolean;
}
