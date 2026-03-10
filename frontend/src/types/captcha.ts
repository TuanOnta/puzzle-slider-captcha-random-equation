export interface EquationParams {
  x1: number;
  x2: number;
  x3: number;
  yAmplitude: number;
  yFrequency: number;
  rotationFactor: number;
}

export interface ChallengeResponse {
  id: string;
  background: string;
  piece: string;
  pieceY: number;
  equationParams?: EquationParams;
}

export interface VerifyResponse {
  success: boolean;
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
