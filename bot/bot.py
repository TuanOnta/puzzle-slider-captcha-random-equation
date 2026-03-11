#!/usr/bin/env python3
"""
CAPTCHA Bypass Test Bot
=======================
Uses edge detection + template matching (same algorithm as main.py) on both
conventional and equation CAPTCHA modes to measure the bypass rate.

Usage:
    python bot.py <n>                     # test both modes, n attempts each
    python bot.py <n> --mode conventional
    python bot.py <n> --mode equation
"""

import argparse
import base64
import random
import time

import cv2
import numpy as np
import requests

BACKEND_URL = "http://localhost:3000"

# ─── Image helpers ─────────────────────────────────────────────────────────────

def decode_image(b64_str: str) -> np.ndarray:
    """Decode a base64 PNG string to a BGR numpy array."""
    img_bytes = base64.b64decode(b64_str)
    arr = np.frombuffer(img_bytes, dtype=np.uint8)
    return cv2.imdecode(arr, cv2.IMREAD_COLOR)


def remove_whitespace(img: np.ndarray) -> tuple[np.ndarray, int, int]:
    """
    Crop to the bounding box of non-uniform pixels (same logic as main.py).
    Also returns (offset_x, offset_y) — the number of pixels trimmed from the
    left and top — so callers can compensate the template match coordinate.
    Falls back to the original image (offset 0, 0) if no non-uniform pixels found.
    """
    min_x, min_y, max_x, max_y = 255, 255, 0, 0
    rows, cols, _ = img.shape
    for x in range(1, rows):
        for y in range(1, cols):
            if len(set(img[x, y])) >= 2:
                min_x, min_y = min(x, min_x), min(y, min_y)
                max_x, max_y = max(x, max_x), max(y, max_y)
    if max_x <= min_x or max_y <= min_y:
        return img, 0, 0
    return img[min_x:max_x, min_y:max_y], min_y, min_x  # offset_x=min_y, offset_y=min_x


def apply_edge_detection(img: np.ndarray) -> np.ndarray:
    """Canny edge detection (same logic as main.py): BGR → grayscale → edges → BGR."""
    grayscale_img = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(grayscale_img, 100, 200)
    return cv2.cvtColor(edges, cv2.COLOR_GRAY2RGB)


def find_position_of_slide(slide_pic: np.ndarray, background_pic: np.ndarray) -> int:
    """
    Template match the slide against the background (same logic as main.py).
    Returns the x-coordinate of the best match.
    """
    result = cv2.matchTemplate(background_pic, slide_pic, cv2.TM_CCOEFF_NORMED)
    _, _, _, max_loc = cv2.minMaxLoc(result)
    return max_loc[0]


def discern(piece_arr: np.ndarray, bg_arr: np.ndarray) -> int:
    """
    Full pipeline mirroring PuzzleCaptchaSolver.discern() from main.py,
    operating on in-memory arrays instead of file paths.
    The offset_x returned by remove_whitespace is added back to the raw match
    position to compensate for the pixels trimmed from the left of the piece.
    """
    gap_cropped, offset_x, _ = remove_whitespace(piece_arr)
    edge_detected_gap         = apply_edge_detection(gap_cropped)
    edge_detected_bg          = apply_edge_detection(bg_arr)
    raw_x                     = find_position_of_slide(edge_detected_gap, edge_detected_bg)
    return raw_x - offset_x


# ─── Trajectory generator ──────────────────────────────────────────────────────

def make_fake_trajectory(target_x: int) -> dict:
    """
    Build a fake but plausible human-like drag trajectory.
    Satisfies backend heuristics: duration >= 150ms, >= 3 points,
    timestamps strictly increasing.
    """
    duration_ms = random.randint(500, 900)
    t0 = int(time.time() * 1000)
    n_points = random.randint(22, 40)
    trajectory = []

    for i in range(n_points):
        progress = i / (n_points - 1)
        ease = progress * progress * (3.0 - 2.0 * progress)  # smooth-step
        x = int(ease * target_x + random.gauss(0, 1.2))
        y = int(random.gauss(0, 2.0))
        t = t0 + int(progress * (duration_ms - 50)) + random.randint(0, 8)
        trajectory.append({"x": x, "y": y, "t": t})

    for i in range(1, len(trajectory)):
        if trajectory[i]["t"] <= trajectory[i - 1]["t"]:
            trajectory[i]["t"] = trajectory[i - 1]["t"] + random.randint(5, 15)

    return {
        "mouseDown":  {"x": 0,        "y": 0, "t": t0},
        "mouseUp":    {"x": target_x, "y": 0, "t": t0 + duration_ms},
        "trajectory": trajectory,
    }


# ─── Single-attempt solver (same algorithm for both modes) ────────────────────

def solve_once(mode: str, debug: bool = False) -> bool:
    """
    Attempt to bypass one CAPTCHA using the same algorithm for both modes:
      1. Fetch challenge → decode base64 images
      2. discern() → detected pixel x  (remove_whitespace → edge-detect → template match)
      3. Submit detected x as userX

    Conventional: backend checks abs(userX - targetX) <= 5 px  → likely PASS
    Equation:     backend checks abs(userX - targetT) <= 1      → likely FAIL
                  (targetT is a slider value ~30–240, not a pixel position)
    """
    resp = requests.get(f"{BACKEND_URL}/challenge", params={"mode": mode}, timeout=10)
    resp.raise_for_status()
    data = resp.json()

    bg_arr    = decode_image(data["background"])
    piece_arr = decode_image(data["piece"])

    # Debug: show intermediate values
    gap_cropped, offset_x, offset_y = remove_whitespace(piece_arr)
    edge_gap = apply_edge_detection(gap_cropped)
    edge_bg  = apply_edge_detection(bg_arr)
    raw_x    = find_position_of_slide(edge_gap, edge_bg)
    detected_x = raw_x - offset_x

    if debug:
        print(f"    piece shape={piece_arr.shape}  cropped shape={gap_cropped.shape}")
        print(f"    offset_x={offset_x}  raw_x={raw_x}  detected_x={detected_x}")
        print(f"    pieceY from response={data['pieceY']}")

    trajectory = make_fake_trajectory(detected_x)

    vresp = requests.post(
        f"{BACKEND_URL}/verify",
        json={"id": data["id"], "userX": detected_x, "trajectoryData": trajectory},
        timeout=10,
    )
    vresp.raise_for_status()
    return vresp.json().get("success", False)


# ─── Test runner ───────────────────────────────────────────────────────────────

def run_test(mode: str, n: int) -> dict:
    passed = 0
    failed = 0
    errors = 0

    pad = len(str(n))
    print(f"\n{'─' * 50}")
    print(f"  Mode: {mode.upper()}   ({n} attempts)")
    print(f"{'─' * 50}")

    for i in range(1, n + 1):
        try:
            success = solve_once(mode, debug=False
            )
            if success:
                passed += 1
                label = "PASS"
            else:
                failed += 1
                label = "FAIL"
        except Exception as exc:
            errors += 1
            label = f"ERROR ({exc})"

        print(f"  [{i:>{pad}}/{n}]  {label}")

    valid = n - errors
    rate  = (passed / valid * 100) if valid > 0 else 0.0

    print(f"\n  Passed : {passed}/{valid}  ({rate:.1f}%)")
    print(f"  Failed : {failed}/{valid}")
    if errors:
        print(f"  Errors : {errors}")

    return {"mode": mode, "n": n, "passed": passed, "failed": failed, "errors": errors, "rate": rate}


# ─── Entry point ───────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="CAPTCHA bypass test bot — same algorithm on both modes.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python bot.py 50               # test both modes, 50 attempts each
  python bot.py 200              # test both modes, 200 attempts each
  python bot.py 100 --mode conventional
  python bot.py 100 --mode equation
        """,
    )
    parser.add_argument("n",      type=int,                                        help="Number of CAPTCHAs to test per mode")
    parser.add_argument("--mode", choices=["both", "conventional", "equation"],
                        default="both",                                            help="Which mode to test (default: both)")
    args = parser.parse_args()

    print("╔══════════════════════════════════════════════════╗")
    print("║         CAPTCHA Bypass Test Bot                  ║")
    print("╚══════════════════════════════════════════════════╝")
    print(f"  Backend : {BACKEND_URL}")
    print(f"  Attempts: {args.n} per mode")
    print(f"  Algorithm: remove_whitespace → edge_detect → template_match")

    results = []

    if args.mode in ("both", "conventional"):
        results.append(run_test("conventional", args.n))

    if args.mode in ("both", "equation"):
        results.append(run_test("equation", args.n))

    # ── Final summary ─────────────────────────────────────────────────────────
    if len(results) > 1:
        print(f"\n{'═' * 50}")
        print("  SUMMARY")
        print(f"{'═' * 50}")
        for r in results:
            bar_len = 30
            filled  = int(r["rate"] / 100 * bar_len)
            bar     = "█" * filled + "░" * (bar_len - filled)
            print(f"  {r['mode']:>14}  [{bar}]  {r['rate']:5.1f}%")

        conv = next((r for r in results if r["mode"] == "conventional"), None)
        eq   = next((r for r in results if r["mode"] == "equation"),     None)
        if conv and eq:
            print()
            if conv["rate"] > 60 and eq["rate"] < 30:
                verdict = "SUCCESS — bot bypasses conventional but NOT equation."
            elif conv["rate"] > 60 and eq["rate"] >= 30:
                verdict = "PARTIAL  — equation CAPTCHA still partially bypassed."
            else:
                verdict = "INCONCLUSIVE — check server connection or image alignment."
            print(f"  Hypothesis: {verdict}")

    print()


if __name__ == "__main__":
    main()
