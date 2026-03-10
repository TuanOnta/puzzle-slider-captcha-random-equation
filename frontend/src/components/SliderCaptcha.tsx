import { useCaptcha, MAX_TRAVEL, HANDLE_WIDTH, SLIDER_MAX_TRAVEL } from "../hooks/useCaptcha";

export default function SliderCaptcha() {
  const {
    mode, setMode, challenge, sliderValue, result, isLoading, isVerifying,
    loadChallenge, onSliderChange, onPointerDown, onPointerMove, onPointerUp,
  } = useCaptcha();

  const handleFill = `calc(${(sliderValue / MAX_TRAVEL) * SLIDER_MAX_TRAVEL}px + ${HANDLE_WIDTH}px)`;
  const handleOffset = `translateX(${(sliderValue / MAX_TRAVEL) * SLIDER_MAX_TRAVEL}px)`;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-900 bg-[radial-gradient(ellipse_at_top,var(--tw-gradient-stops))] from-slate-800 via-slate-900 to-black p-4 font-sans text-slate-800">
      <div className="w-full max-w-95 rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-900/5">

        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-50">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Security Check</h3>
              <p className="text-xs text-slate-500">Complete the puzzle</p>
            </div>
          </div>
          <button
            title="Refresh Captcha"
            onClick={loadChallenge}
            disabled={isLoading}
            className="group rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-blue-600 focus:outline-none disabled:opacity-50"
          >
            <svg className={`w-5 h-5 transition-transform duration-500 ${isLoading ? "animate-spin" : "group-hover:rotate-180"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="mb-6 flex justify-center">
          <div className={`flex items-center gap-3 rounded-full bg-slate-100 p-1 px-1.5 ring-1 ring-slate-200 ${result ? "opacity-50 pointer-events-none" : ""}`}>
            {(["conventional", "equation"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-all ${mode === m ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
              >
                {m === "conventional" ? "Classic" : "Equation"}
              </button>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="relative flex flex-col items-center">

          {!challenge && (
            <div className="flex h-50 w-[320px] flex-col items-center justify-center rounded-xl bg-slate-100 border-2 border-dashed border-slate-300 text-slate-400">
              <span className="text-sm font-medium animate-pulse">Generating Challenge...</span>
            </div>
          )}

          {challenge && (
            <>
              {/* Puzzle Image */}
              <div className="relative h-50 w-[320px] overflow-hidden rounded-xl bg-slate-200 shadow-inner ring-1 ring-black/5">
                <img src={`data:image/png;base64,${challenge.background}`} alt="Background" className="h-full w-full object-cover" />
                <img
                  src={`data:image/png;base64,${challenge.piece}`}
                  alt="Piece"
                  style={{ left: `${sliderValue}px`, top: `${challenge.pieceY}px` }}
                  className="absolute z-10 drop-shadow-[0_4px_4px_rgba(0,0,0,0.5)] pointer-events-none will-change-transform"
                />
              </div>

              {/* Slider */}
              <div className="mt-6 w-[320px] select-none touch-none">
                <div className="relative h-12 w-full rounded-full bg-slate-100 shadow-inner ring-1 ring-slate-200/60 overflow-hidden">
                  {!isVerifying && !result && (
                    <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tracking-wider text-slate-400 pointer-events-none">
                      SLIDE TO VERIFY
                    </span>
                  )}
                  <div
                    className={`absolute left-0 top-0 h-full transition-colors duration-200 ${result === "Bot" ? "bg-red-100" : "bg-blue-100"}`}
                    style={{ width: handleFill }}
                  />
                  <input
                    title="Slider captcha"
                    type="range" min="0" max={MAX_TRAVEL} step="1"
                    value={sliderValue}
                    onChange={onSliderChange}
                    onMouseDown={onPointerDown} onTouchStart={onPointerDown}
                    onMouseMove={onPointerMove} onTouchMove={onPointerMove}
                    onMouseUp={onPointerUp}    onTouchEnd={onPointerUp}
                    disabled={!!result || isVerifying}
                    className="absolute inset-0 z-20 h-full w-full opacity-0 cursor-ew-resize active:cursor-grabbing disabled:cursor-not-allowed m-0 appearance-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-12 [&::-webkit-slider-thumb]:h-10"
                  />
                  <div
                    className="absolute top-1 left-0 h-10 w-12 flex items-center justify-center rounded-full bg-white shadow-[0_2px_5px_rgba(0,0,0,0.15)] ring-1 ring-slate-200 pointer-events-none transition-transform duration-75 ease-out"
                    style={{ transform: handleOffset }}
                  >
                    {isVerifying
                      ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-blue-600" />
                      : <svg className="w-5 h-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5m0 0l-5 5m5-5H6" /></svg>
                    }
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Status */}
          <div className="mt-5 w-full min-h-14 flex flex-col justify-center">
            {isVerifying && (
              <div className="flex items-center justify-center gap-2 text-blue-600 animate-pulse">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                <span className="text-sm font-semibold">Verifying pattern...</span>
              </div>
            )}
            {result === "Human" && (
              <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 ring-1 ring-emerald-500/20 animate-in slide-in-from-bottom-2 fade-in duration-300">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow-sm">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                </div>
                <div>
                  <p className="text-sm font-bold text-emerald-700">Verification Success</p>
                  <p className="text-xs text-emerald-600">You are verified human.</p>
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
                <button onClick={loadChallenge} className="rounded-lg bg-rose-100 px-3 py-1.5 text-xs font-bold text-rose-700 transition-colors hover:bg-rose-200">
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