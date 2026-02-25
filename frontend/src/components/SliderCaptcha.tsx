import React, { useEffect, useRef, useState } from "react";
// Ensure these import paths match your folder structure
import { fetchChallenge, verifyCaptcha } from "../services/api"; 
import type { ChallengeResponse } from "../types/captcha"; 

interface TrajectoryPoint {
  x: number;
  y: number;
  t: number;
}

export default function SliderCaptcha() {
  const [mode, setMode] = useState<"conventional" | "equation">("conventional");
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [sliderValue, setSliderValue] = useState<number>(0); 
  const [result, setResult] = useState<"Human" | "Bot" | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  // Constants for absolute positioning calculations
  const CANVAS_WIDTH = 320;
  // Estimated puzzle piece width including padding (50px + padding).
  const PUZZLE_WIDTH = 60; 
  // Maximum travel distance for the puzzle piece = Canvas Width - Piece Width
  const MAX_TRAVEL = CANVAS_WIDTH - PUZZLE_WIDTH; 
  // Slider handle width (w-12 = 48px)
  const HANDLE_WIDTH = 48;
  // Maximum travel distance for the slider handle
  const SLIDER_MAX_TRAVEL = CANVAS_WIDTH - HANDLE_WIDTH;

  const trajectoryRef = useRef<TrajectoryPoint[]>([]);

  useEffect(() => {
    loadChallenge();
  }, [mode]);

  async function loadChallenge() {
    setIsLoading(true);
    try {
      const data = await fetchChallenge(mode);
      setChallenge(data);
      setSliderValue(0);
      setResult(null);
      trajectoryRef.current = [];
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  }

  function handleSliderChange(e: React.ChangeEvent<HTMLInputElement>) {
    // 1. If result exists (Success/Fail) or currently verifying, lock the slider.
    if (result || isVerifying) return; 

    // Input range value 0 - MAX_TRAVEL (in pixels)
    const value = Number(e.target.value);
    setSliderValue(value);
    
    trajectoryRef.current.push({ x: value, y: 0, t: Date.now() });
  }

  async function handleMouseUp() {
    if (!challenge || result || isVerifying) return; // Prevent double submission

    setIsVerifying(true);
    try {
      const res = await verifyCaptcha(challenge.id, sliderValue, trajectoryRef.current);
      const isHuman = res.success;
      
      setResult(isHuman ? "Human" : "Bot");

    } catch (err) {
      console.error("Verification failed", err);
      setResult("Bot"); // Default to Fail on error
    } finally {
      setIsVerifying(false);
    }
  }

  // Helper to reset if user wants to try again after failure
  const handleRefresh = () => {
    loadChallenge();
  };

  // --- ICONS ---
  const RefreshIcon = () => (
    <svg className={`w-5 h-5 transition-transform duration-500 ${isLoading ? "animate-spin" : "group-hover:rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
  );
  
  const ShieldIcon = () => (
    <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black p-4 font-sans text-slate-800">
      
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/5">
        
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors bg-blue-50 text-blue-600`}>
              <ShieldIcon />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Security Check</h3>
              <p className="text-xs text-slate-500">
                {mode === "equation" ? "Solve the equation" : "Complete the puzzle"}
              </p>
            </div>
          </div>
          <button 
            title="Refresh Captcha"
            onClick={handleRefresh} 
            disabled={isLoading}
            className="group rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 focus:outline-none disabled:opacity-50"
          >
            <RefreshIcon />
          </button>
        </div>

        {/* Mode Toggle (Disabled when result exists) */}
        <div className="mb-6 flex justify-center">
            <div className={`flex items-center gap-3 rounded-full bg-slate-100 p-1 px-1.5 ring-1 ring-slate-200 ${result ? "opacity-50 pointer-events-none" : ""}`}>
                <button 
                    onClick={() => setMode("conventional")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${mode === "conventional" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    Classic
                </button>
                <button 
                    onClick={() => setMode("equation")}
                    className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${mode === "equation" ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                    Equation
                </button>
            </div>
        </div>

        {/* Main Content Area */}
        <div className="relative flex flex-col items-center">
          
          {/* Loading State */}
          {(!challenge) && (
             <div className="flex h-[200px] w-[320px] flex-col items-center justify-center rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 text-slate-400">
                <span className="text-sm font-medium animate-pulse">Generating Challenge...</span>
             </div>
          )}

          {/* Puzzle & Slider */}
          {challenge && (
            <>
              {/* Image Container */}
              <div className="relative h-[200px] w-[320px] overflow-hidden rounded-xl bg-slate-200 shadow-inner ring-1 ring-black/5">
                <img 
                  src={`data:image/png;base64,${challenge.background}`} 
                  alt="Background" 
                  className="h-full w-full object-cover" 
                />
                
                {/* Puzzle Piece */}
                <img
                  src={`data:image/png;base64,${challenge.piece}`}
                  alt="Piece"
                  style={{ 
                    left: `${sliderValue}px`, // Using exact pixel value for 1:1 sync
                    top: `${challenge.pieceY}px` // Using Y from backend
                  }}
                  className="absolute z-10 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] pointer-events-none will-change-transform"
                />
              </div>

              {/* Slider Control Container */}
              <div className="mt-6 w-[320px] select-none touch-none"> {/* touch-none prevents page scrolling on mobile drag */}
                <div className="relative h-12 w-full rounded-full bg-slate-100 shadow-inner ring-1 ring-slate-200/60 overflow-hidden">
                    
                    {/* Background Text & Progress */}
                     {!isVerifying && !result && (
                        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tracking-wider text-slate-400 pointer-events-none">
                            SLIDE TO VERIFY
                        </span>
                     )}
                     
                     {/* Progress Fill */}
                     <div 
                        className={`absolute left-0 top-0 h-full transition-colors duration-200 ${result === "Bot" ? "bg-red-100" : "bg-blue-100"}`}
                        style={{ width: `calc(${(sliderValue / MAX_TRAVEL) * SLIDER_MAX_TRAVEL}px + ${HANDLE_WIDTH}px)` }} // Visual fill percentage
                     ></div>

                    {/* ACTUAL INPUT RANGE (Invisible but functional) */}
                    <input
                        title="input range for slider captcha"
                        type="range"
                        min="0"
                        max={MAX_TRAVEL}
                        step="1" // Step 1 pixel
                        value={sliderValue}
                        onChange={handleSliderChange}
                        onMouseUp={handleMouseUp}
                        onTouchEnd={handleMouseUp}
                        disabled={!!result || isVerifying}
                        className="absolute inset-0 z-20 h-full w-full opacity-0 cursor-ew-resize active:cursor-grabbing disabled:cursor-not-allowed m-0 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-12 [&::-webkit-slider-thumb]:h-10"
                    />

                    <div
                        className="absolute top-1 left-0 h-10 w-12 flex items-center justify-center rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.15)] ring-1 ring-slate-200 pointer-events-none transition-transform duration-75 ease-out"
                        style={{ 
                            transform: `translateX(${(sliderValue / MAX_TRAVEL) * SLIDER_MAX_TRAVEL}px)` 
                        }}
                    >
                        {/* Knob Icon */}
                        {isVerifying ? (
                           <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600"></div>
                        ) : (
                           <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                           </svg>
                        )}
                    </div>

                </div>
              </div>
            </>
          )}

          {/* Bottom Status Area */}
          <div className="mt-5 w-full min-h-[56px] flex flex-col justify-center">
             {isVerifying && (
                <div className="flex items-center justify-center gap-2 text-blue-600 animate-pulse">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"></div>
                  <span className="text-sm font-semibold">Verifying pattern...</span>
                </div>
             )}

             {result === "Human" && (
                <div className="flex items-center justify-between rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-500/20 animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-emerald-700">Verification Success</p>
                      <p className="text-xs text-emerald-600">You are verified human.</p>
                    </div>
                  </div>
                </div>
             )}

             {result === "Bot" && (
                <div className="flex items-center justify-between rounded-xl bg-rose-50 p-3 ring-1 ring-rose-500/20 animate-in slide-in-from-bottom-2 fade-in duration-300">
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white shadow-sm">
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-rose-700">Verification Failed</p>
                      <p className="text-xs text-rose-600">Bot behavior detected.</p>
                    </div>
                  </div>
                  <button 
                    onClick={handleRefresh}
                    className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-200"
                  >
                    Try Again
                  </button>
                </div>
             )}
          </div>

        </div>
      </div>
    </div>
  );
}