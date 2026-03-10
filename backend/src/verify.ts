import { CaptchaEngine, Challenge, VerificationInput, CaptchaTrajectoryData } from "./engines/captcha-engine";

/**
 * Validate that the drag trajectory was produced by a human, not a script.
 * Three heuristics are applied:
 *   1. Duration ≥ 150 ms  — rejects instant programmatic submissions
 *   2. ≥ 3 trajectory points — rejects single-event (mousedown → mouseup) automation
 *   3. Points are not all simultaneous — rejects batched event injection
 */
const verifyHumanTrajectory = ({ mouseDown, mouseUp, trajectory }: CaptchaTrajectoryData, logger?: any): boolean => {
  const duration = mouseUp.t - mouseDown.t;
  if (duration < 150)        { logger?.warn(`Trajectory rejected: too fast (${duration}ms)`);               return false; }
  if (trajectory.length < 3) { logger?.warn(`Trajectory rejected: too few points (${trajectory.length})`); return false; }
  if (!trajectory.some((p, i) => i > 0 && p.t > trajectory[i - 1].t)) {
    logger?.warn(`Trajectory rejected: all events fired simultaneously`);
    return false;
  }
  logger?.info(`Trajectory accepted: ${duration}ms, ${trajectory.length} points`);
  return true;
};

/**
 * Full verification pipeline:
 *   1. Require trajectory data (missing = bot)
 *   2. Run human-trajectory heuristics
 *   3. Delegate position check to the engine's verify() method
 */
export const verifyCaptcha = (
  engine: CaptchaEngine,
  challenge: Challenge,
  userX: number,
  trajectoryData?: CaptchaTrajectoryData,
  logger?: any
): boolean => {
  if (!trajectoryData) { logger?.warn(`No trajectory data for challenge ${challenge.id}`); return false; }
  if (!verifyHumanTrajectory(trajectoryData, logger)) return false;
  return engine.verify({ challenge, userX, trajectoryData } satisfies VerificationInput, logger);
};
