import Fastify from "fastify";
import cors from "@fastify/cors";
import { ConventionalEngine } from "./engines/conventional";
import { generateChallenge } from "./challenge";
import { verifyCaptcha } from "./verify";
import { CaptchaEngine, ConventionalChallenge } from "./engines/captcha-engine";

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',  
      options: {
        translateTime: 'SYS:HH:MM:ss Z',
        ignore: 'pid,hostname'           
      }
    }
  }
})
fastify.register(cors, {origin: "http://localhost:5173"})

const Conventionalengine = new ConventionalEngine();
const EquationEngine = null; // Placeholder for future implementation

interface ServerChallenge {
  id: string;
  mode: "conventional" | "equation";
  engine: CaptchaEngine;
  seed: number;
  equationParams?: any;
  canvasWidth: number;
  notch: { x: number; y: number };
  targetX: number;
  createdAt: number;
  expiresAt: number;
  tolerance: number;
  engineChallenge: ConventionalChallenge;
}

const activeChallenges = new Map<string, ServerChallenge>();

fastify.get("/challenge", async (request, reply) => {
  const seed = Date.now();
  const query = request.query as { mode: "conventional" | "equation" };

  let inputEngine: CaptchaEngine = Conventionalengine;
  if (query.mode == "conventional") {
    inputEngine = Conventionalengine;
  }else if (query.mode == "equation") {
    // inputEngine = EquationEngine;
  }

  // Generate challenge using the engine
  const engineChallenge = await generateChallenge(inputEngine, seed, request.log) as ConventionalChallenge;

  const challenge: ServerChallenge = {
    id: engineChallenge.id,
    mode: query.mode,
    engine: inputEngine,
    seed,
    canvasWidth: engineChallenge.canvasWidth,
    notch: { x: engineChallenge.targetX, y: engineChallenge.targetY },
    targetX: engineChallenge.targetX,
    tolerance: engineChallenge.tolerance,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
    engineChallenge
  };

  request.log.info(`Generated challenge ${challenge.id} with seed ${seed} in mode ${challenge.mode}`);

  activeChallenges.set(challenge.id, challenge);

  request.log.info(`Active challenges count: ${activeChallenges.size}`);

  return {
    id: challenge.id,
    canvasWidth: challenge.canvasWidth,
    background: engineChallenge.backgroundBuffer.toString("base64"),
    piece: engineChallenge.pieceBuffer.toString("base64"),
    pieceY: engineChallenge.targetY
  };
});

fastify.post("/verify", async (request, reply) => {
  const body = request.body as {
    id: string;
    userX: number;
    trajectory?: { x: number; t: number }[];
  };

  const challenge = activeChallenges.get(body.id);

  if (!challenge) {
    return reply.status(400).send({
      success: false,
      message: "Invalid or expired challenge"
    });
  }

  

  request.log.info(`Verifying challenge ${body.id} with userX: ${body.userX}`);

  const result = verifyCaptcha(
    challenge.engine,
    challenge.engineChallenge,
    body.userX,
    body.trajectory,
    request.log
  );

  activeChallenges.delete(body.id);

  request.log.info(`Verification result for challenge ${body.id}: ${result}`);

  return {
    success: result
  };
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
