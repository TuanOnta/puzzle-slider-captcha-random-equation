import type { ChallengeResponse, VerifyResponse, CaptchaTrajectoryData } from "../types/captcha";

const BASE_URL = "http://localhost:3000";

export async function fetchChallenge(
  mode: "conventional" | "equation"
): Promise<ChallengeResponse> {

  const res = await fetch(`${BASE_URL}/challenge?mode=${mode}`);

  if (!res.ok) {
    throw new Error("Failed to fetch challenge");
  }

  return res.json();
}

export async function verifyCaptcha(
  id: string,
  userX: number,
  trajectoryData: CaptchaTrajectoryData
): Promise<VerifyResponse> {

  const res = await fetch(`${BASE_URL}/verify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, userX, trajectoryData }),
  });

  if (!res.ok) {
    throw new Error("Verification failed");
  }

  return res.json();
}
