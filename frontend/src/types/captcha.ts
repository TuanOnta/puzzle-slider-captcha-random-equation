export interface ChallengeResponse {
  id: string;
  background: string;
  piece: string;
  pieceY: number;
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
