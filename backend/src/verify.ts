// src/verify.ts

import { CaptchaEngine, Challenge, VerificationInput } from "./engines/captcha-engine";

export const verifyCaptcha = (
  engine: CaptchaEngine,
  challenge: Challenge,
  userX: number,
  trajectory?: { x: number; t: number }[],
  logger?: any
): boolean => {

  const input: VerificationInput = {
    challenge,
    userX,
    trajectory
  };

  return engine.verify(input, logger);
};
