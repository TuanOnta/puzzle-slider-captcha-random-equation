import React, { useEffect, useRef, useState } from "react";
import { fetchChallenge, verifyCaptcha } from "../services/api";
import type { ChallengeResponse, CaptchaTrajectoryData, TrajectoryPoint, EquationParams } from "../types/captcha";

// ─── Layout constants (must match backend image-generator.ts) ─────────────────
export const CANVAS_WIDTH     = 320;
export const PUZZLE_WIDTH     = 60;
export const HANDLE_WIDTH     = 48;
export const MAX_TRAVEL       = CANVAS_WIDTH - PUZZLE_WIDTH;  // 260px — slider input range
export const SLIDER_MAX_TRAVEL = CANVAS_WIDTH - HANDLE_WIDTH; // 272px — visual handle travel

const OUTPUT_WIDTH  = 320;
const OUTPUT_HEIGHT = 200;
const PIECE_SIZE    = 50;
const BUFFER_PADDING = 15;

// ─── Equation helpers ─────────────────────────────────────────────────────────

/**
 * Mirror of the backend's computeEquation() — must stay in sync with equation.ts.
 * Given slider value t and equation params, returns the piece's:
 *   x, y — CSS pixel position (top-left of the 80px piece image)
 *   theta — rotation in degrees applied via CSS transform
 */
function computeEquationPos(t: number, params: EquationParams) {
  const j     = params.x1 * t * t + params.x2 * t + params.x3;
  const x     = Math.max(0, Math.min(j, OUTPUT_WIDTH - PIECE_SIZE));
  const yCenter = (OUTPUT_HEIGHT - PIECE_SIZE) / 2;
  const y     = Math.max(0, Math.min(yCenter + params.yAmplitude * Math.sin(j * params.yFrequency), OUTPUT_HEIGHT - PIECE_SIZE));
  const theta = params.rotationFactor * Math.sin(j * params.yFrequency);
  return { x: Math.max(0, x - BUFFER_PADDING), y: Math.max(0, y - BUFFER_PADDING), theta };
}

// ─── Pointer helpers ──────────────────────────────────────────────────────────

/** Extract client (x, y) from a mouse or touch start/move event. */
function getCoords(e: React.MouseEvent | React.TouchEvent) {
  return "touches" in e
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
    : { x: e.clientX, y: e.clientY };
}

/** Extract client (x, y) from a mouse or touch end event. */
function getEndCoords(e: React.MouseEvent | React.TouchEvent) {
  return "changedTouches" in e
    ? { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY }
    : { x: (e as React.MouseEvent).clientX, y: (e as React.MouseEvent).clientY };
}

/**
 * Client-side human-trajectory pre-check (mirrors backend verifyHumanTrajectory).
 * Prevents sending obviously bot-like interactions to the server.
 */
function isHumanTrajectory({ mouseDown, mouseUp, trajectory }: CaptchaTrajectoryData): boolean {
  if (mouseUp.t - mouseDown.t < 150) return false;
  if (trajectory.length < 3) return false;
  return trajectory.some((p, i) => i > 0 && p.t > trajectory[i - 1].t);
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Central state and event logic for the CAPTCHA widget.
 *
 * Manages:
 *   - Challenge loading / mode switching
 *   - Pointer event capture (mousedown → mousemove → mouseup)
 *   - Trajectory collection and pre-validation
 *   - Server verification call
 *   - Derived piece position (x, y, theta) for both modes
 */
export function useCaptcha() {
  const [mode,        setMode]        = useState<"conventional" | "equation">("conventional");
  const [challenge,   setChallenge]   = useState<ChallengeResponse | null>(null);
  const [sliderValue, setSliderValue] = useState(0);
  const [result,      setResult]      = useState<"Human" | "Bot" | null>(null);
  const [isLoading,   setIsLoading]   = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const trajectoryRef  = useRef<TrajectoryPoint[]>([]);
  const mouseDownRef   = useRef<TrajectoryPoint | null>(null);

  // Reload challenge whenever mode changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { loadChallenge(); }, [mode]);

  /** Fetch a fresh challenge from the server and reset all interaction state. */
  async function loadChallenge() {
    setIsLoading(true);
    try {
      const data = await fetchChallenge(mode);
      setChallenge(data);
      setSliderValue(0);
      setResult(null);
      trajectoryRef.current  = [];
      mouseDownRef.current   = null;
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  /** Update slider value while dragging (locked after result or during verify). */
  function onSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (!result && !isVerifying) setSliderValue(Number(e.target.value));
  }

  /** Record drag start position and reset the trajectory buffer. */
  function onPointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (result || isVerifying) return;
    const { x, y } = getCoords(e);
    mouseDownRef.current  = { x, y, t: Date.now() };
    trajectoryRef.current = [];
  }

  /** Append current pointer position to the trajectory buffer. */
  function onPointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!mouseDownRef.current || result || isVerifying) return;
    const { x, y } = getCoords(e);
    trajectoryRef.current.push({ x, y, t: Date.now() });
  }

  /**
   * On drag release: run the client-side human check, then send to server.
   * userX submitted = raw sliderValue (the t value for equation mode).
   */
  async function onPointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (!challenge || result || isVerifying || !mouseDownRef.current) return;
    const { x, y } = getEndCoords(e);

    const trajectoryData: CaptchaTrajectoryData = {
      mouseDown:  mouseDownRef.current,
      mouseUp:    { x, y, t: Date.now() },
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

  // ── Derived piece position ──────────────────────────────────────────────────
  // Equation mode: compute (x, y, theta) from the parametric equation.
  // Conventional mode: x = sliderValue, y = fixed from challenge, theta = 0.
  const eqPos = (mode === "equation" && challenge?.equationParams)
    ? computeEquationPos(sliderValue, challenge.equationParams)
    : null;

  const pieceX        = eqPos?.x     ?? sliderValue;
  const pieceCurrentY = eqPos?.y     ?? (challenge?.pieceY ?? 0);
  const pieceTheta    = eqPos?.theta ?? 0;

  return {
    mode, setMode, challenge, sliderValue, result, isLoading, isVerifying,
    loadChallenge, onSliderChange, onPointerDown, onPointerMove, onPointerUp,
    pieceX, pieceCurrentY, pieceTheta,
  };
}
