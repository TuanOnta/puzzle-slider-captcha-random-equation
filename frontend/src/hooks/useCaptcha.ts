import React, { useEffect, useRef, useState } from "react";
import { fetchChallenge, verifyCaptcha } from "../services/api";
import type { ChallengeResponse, CaptchaTrajectoryData, TrajectoryPoint } from "../types/captcha";

export const CANVAS_WIDTH = 320;
export const PUZZLE_WIDTH = 60;
export const HANDLE_WIDTH = 48;
export const MAX_TRAVEL = CANVAS_WIDTH - PUZZLE_WIDTH;       // 260px
export const SLIDER_MAX_TRAVEL = CANVAS_WIDTH - HANDLE_WIDTH; // 272px

function getCoords(e: React.MouseEvent | React.TouchEvent) {
  if ("touches" in e) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
  return { x: e.clientX, y: e.clientY };
}

function getEndCoords(e: React.MouseEvent | React.TouchEvent) {
  if ("changedTouches" in e) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
  return { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
}

function isHumanTrajectory({ mouseDown, mouseUp, trajectory }: CaptchaTrajectoryData): boolean {
  if (mouseUp.t - mouseDown.t < 150) return false;
  if (trajectory.length < 3) return false;
  return trajectory.some((p, i) => i > 0 && p.t > trajectory[i - 1].t);
}

export function useCaptcha() {
  const [mode, setMode] = useState<"conventional" | "equation">("conventional");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [result, setResult] = useState<"Human" | "Bot" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const trajectoryRef = useRef<TrajectoryPoint[]>([]);
  const mouseDownRef = useRef<TrajectoryPoint | null>(null);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadChallenge(); }, [mode]);

  async function loadChallenge() {
    setIsLoading(true);
    try {
      const data = await fetchChallenge(mode);
      setChallenge(data);
      setSliderValue(0);
      setResult(null);
      trajectoryRef.current = [];
      mouseDownRef.current = null;
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function onSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!result && !isVerifying) setSliderValue(Number(e.target.value));
  }

  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (result || isVerifying) return;
    const { x, y } = getCoords(e);
    mouseDownRef.current = { x, y, t: Date.now() };
    trajectoryRef.current = [];
  }

  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!mouseDownRef.current || result || isVerifying) return;
    const { x, y } = getCoords(e);
    trajectoryRef.current.push({ x, y, t: Date.now() });
  }

  async function onPointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (!challenge || result || isVerifying || !mouseDownRef.current) return;
    const { x, y } = getEndCoords(e);

    const trajectoryData: CaptchaTrajectoryData = {
      mouseDown: mouseDownRef.current,
      mouseUp: { x, y, t: Date.now() },
      trajectory: trajectoryRef.current,
    };

    if (!isHumanTrajectory(trajectoryData)) { setResult("Bot"); return; }

    setIsVerifying(true);
    try {
      const { success } = await verifyCaptcha(challenge.id, sliderValue, trajectoryData);
      setResult(success ? "Human" : "Bot");
    } catch (err) {
      console.error("Verification failed", err);
      setResult("Bot");
    } finally {
      setIsVerifying(false);
    }
  }

  return {
    mode, setMode, challenge, sliderValue, result, isLoading, isVerifying,
    loadChallenge, onSliderChange, onPointerDown, onPointerMove, onPointerUp,
  };
}
