import Fastify from "fastify";
import cors from "@fastify/cors";
import { ConventionalEngine } from "./engines/conventional";
import { equationEngine }     from "./engines/equation";
import { verifyCaptcha }      from "./verify";
import { CaptchaEngine, CaptchaTrajectoryData, Challenge, EquationChallenge } from "./engines/captcha-engine";

// ─── Server setup ─────────────────────────────────────────────────────────────

const fastify = Fastify({
  logger: {
    transport: { target: "pino-pretty", options: { translateTime: "SYS:HH:MM:ss Z", ignore: "pid,hostname" } }
  }
});
fastify.register(cors, { origin: "http://localhost:5173" });

// ─── Engine instances (stateless, reused across requests) ─────────────────────

const engines: Record<string, CaptchaEngine> = {
  conventional: new ConventionalEngine(),
  equation:     new equationEngine(),
};

// ─── In-memory challenge store ────────────────────────────────────────────────

interface ActiveChallenge {
  engine: CaptchaEngine;
  challenge: Challenge;
  expiresAt: number;
}

/** Challenges expire after 10 minutes and are deleted on first use (single-use). */
const activeChallenges = new Map<string, ActiveChallenge>();

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /challenge?mode=conventional|equation
 * Generate a new CAPTCHA challenge and return the images + metadata to the client.
 * Images are base64-encoded PNGs. Equation mode also sends equationParams so the
 * frontend can animate the piece trajectory.
 */
fastify.get("/challenge", async (request) => {
  const { mode = "conventional" } = request.query as { mode?: string };
  const engine = engines[mode] ?? engines.conventional;
  const seed   = Date.now();

  const challenge = await engine.generate(seed, request.log) as Challenge;
  activeChallenges.set(challenge.id, { engine, challenge, expiresAt: Date.now() + 10 * 60 * 1000 });

  request.log.info(`Challenge ${challenge.id} generated [mode=${mode}] — active: ${activeChallenges.size}`);

  return {
    id:         challenge.id,
    canvasWidth: challenge.canvasWidth,
    background: challenge.backgroundBuffer.toString("base64"),
    piece:      challenge.pieceBuffer.toString("base64"),
    pieceY:     challenge.initialY,
    // Equation mode only: params needed by frontend to compute piece position
    ...(mode === "equation" && { equationParams: (challenge as EquationChallenge).equationParams }),
  };
});

/**
 * POST /verify
 * Body: { id, userX, trajectoryData }
 * Deletes the challenge on first call (single-use), then runs trajectory +
 * position verification. Returns { success: boolean }.
 */
fastify.post("/verify", async (request, reply) => {
  const { id, userX, trajectoryData } = request.body as {
    id: string;
    userX: number;
    trajectoryData?: CaptchaTrajectoryData;
  };

  const entry = activeChallenges.get(id);
  if (!entry) return reply.status(400).send({ success: false, message: "Invalid or expired challenge" });

  activeChallenges.delete(id); // Single-use: prevent replay attacks

  const success = verifyCaptcha(entry.engine, entry.challenge, userX, trajectoryData, request.log);
  request.log.info(`Challenge ${id} → ${success ? "PASS" : "FAIL"}`);
  return { success };
});

// ─── Start ────────────────────────────────────────────────────────────────────

fastify.listen({ port: 3000 }, err => {
  if (err) { fastify.log.error(err); process.exit(1); }
});
