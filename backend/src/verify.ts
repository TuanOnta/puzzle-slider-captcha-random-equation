import { CaptchaEngine, Challenge, VerificationInput, CaptchaTrajectoryData } from "./engines/captcha-engine";

const verifyHumanTrajectory = ({ mouseDown, mouseUp, trajectory }: CaptchaTrajectoryData, logger?: any): boolean => {
  const duration = mouseUp.t - mouseDown.t;
  if (duration < 150) { logger?.warn(`Trajectory rejected: too fast (${duration}ms)`); return false; }
  if (trajectory.length < 3) { logger?.warn(`Trajectory rejected: too few points (${trajectory.length})`); return false; }
  if (!trajectory.some((p, i) => i > 0 && p.t > trajectory[i - 1].t)) {
    logger?.warn(`Trajectory rejected: all events fired simultaneously`);
    return false;
  }
  logger?.info(`Trajectory accepted: ${duration}ms, ${trajectory.length} points`);
  return true;
};

export const verifyCaptcha = (
  engine: CaptchaEngine,
  challenge: Challenge,
  userX: number,
  trajectoryData?: CaptchaTrajectoryData,
  logger?: any
): boolean => {
  if (!trajectoryData) {
    logger?.warn(`No trajectory data for challenge ${challenge.id}`);
    return false;
  }
  if (!verifyHumanTrajectory(trajectoryData, logger)) return false;

  const input: VerificationInput = { challenge, userX, trajectoryData };
  return engine.verify(input, logger);
};
