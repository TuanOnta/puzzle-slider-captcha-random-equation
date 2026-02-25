import { CaptchaEngine, Challenge } from "./engines/captcha-engine";

export const generateChallenge = async (engine: CaptchaEngine, seed: number, logger?: any): Promise<Challenge> => {
  return await engine.generate(seed, logger);
};
