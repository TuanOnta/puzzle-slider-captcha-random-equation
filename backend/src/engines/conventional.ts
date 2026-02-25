import { CaptchaEngine, Challenge, VerificationInput, ConventionalChallenge } from "./captcha-engine";
import { generatePuzzle } from "../images/image-generator";

export class ConventionalEngine implements CaptchaEngine {
  async generate(seed: number, logger?: any): Promise<ConventionalChallenge> {
    const puzzle = await generatePuzzle(seed);
    
    return {
      id: crypto.randomUUID(),
      canvasWidth: puzzle.canvasWidth,
      targetX: puzzle.targetX,
      targetY: puzzle.targetY,
      tolerance: 5,
      backgroundBuffer: puzzle.backgroundBuffer,
      pieceBuffer: puzzle.pieceBuffer
    };
  }

  verify(input: VerificationInput, logger?: any): boolean {
    const challenge = input.challenge as ConventionalChallenge;

    logger?.info(`ConventionalEngine verifying challenge ${challenge.id} with userX: ${input.userX}`);

    logger?.info(`Challenge targetX: ${challenge.targetX}, tolerance: ${challenge.tolerance}`);

    return (
      Math.abs(input.userX - challenge.targetX) <= challenge.tolerance
    );
  }
}
