import Fastify from "fastify";
import cors from "@fastify/cors";
import { ConventionalEngine } from "./engines/conventional";
import { verifyCaptcha } from "./verify";
import { CaptchaEngine, CaptchaTrajectoryData, Challenge } from "./engines/captcha-engine";

const fastify = Fastify({
  logger: {
    transport: {
      target: 'pino-pretty',
      options: { translateTime: 'SYS:HH:MM:ss Z', ignore: 'pid,hostname' }
    }
  }
});
fastify.register(cors, { origin: "http://localhost:5173" });

const conventionalEngine = new ConventionalEngine();

interface ServerChallenge {
  engine: CaptchaEngine;
  challenge: Challenge;
  expiresAt: number;
}

const activeChallenges = new Map<string, ServerChallenge>();

fastify.get("/challenge", async (request) => {
  const seed = Date.now();
  const { mode } = request.query as { mode: "conventional" | "equation" };

  const engine: CaptchaEngine = conventionalEngine; // equation mode: extend here

  const engineChallenge = await engine.generate(seed, request.log) as Challenge;

  activeChallenges.set(engineChallenge.id, {
    engine,
    challenge: engineChallenge,
    expiresAt: Date.now() + 10 * 60 * 1000,
  });

  request.log.info(`Challenge ${engineChallenge.id} generated [mode=${mode}, seed=${seed}] — active: ${activeChallenges.size}`);

  return {
    id: engineChallenge.id,
    canvasWidth: engineChallenge.canvasWidth,
    background: engineChallenge.backgroundBuffer.toString("base64"),
    piece: engineChallenge.pieceBuffer.toString("base64"),
    pieceY: engineChallenge.initialY,
  };
});

fastify.post("/verify", async (request, reply) => {
  const { id, userX, trajectoryData } = request.body as {
    id: string;
    userX: number;
    trajectoryData?: CaptchaTrajectoryData;
  };

  const entry = activeChallenges.get(id);
  if (!entry) return reply.status(400).send({ success: false, message: "Invalid or expired challenge" });

  activeChallenges.delete(id);

  const result = verifyCaptcha(entry.engine, entry.challenge, userX, trajectoryData, request.log);
  request.log.info(`Challenge ${id} result: ${result}`);

  return { success: result };
});

fastify.listen({ port: 3000 }, (err) => {
  if (err) {
    fastify.log.error(err);
    process.exit(1);
  }
});
