import { useId } from "react";

// ─── Quro Abstract Logo Mark ──────────────────────────────────────────────────
//
// Design: 64×64 viewBox, centre (32,32), ring radius 20
//
//  • Ghost ring   — full circle, white, opacity 0.06 — adds depth
//  • Main Q arc   — 315° clockwise sweep (gap 30°→75° at lower-right)
//                   white stroke, round caps
//  • Tail         — quadratic bezier from arc end, sweeping UP-RIGHT
//                   indigo→purple gradient, tangent-smooth to arc end
//  • Centre dot   — small white filled circle
//
// The tail direction (up-right) echoes the clockwise tangent at 30° on the
// ring: (sin 30°, −cos 30°) ≈ (0.5, −0.866), so the bezier control point is
// placed exactly on that tangent for a seamless visual join.

interface QuroLogoProps {
  /** Rendered pixel size (square). Default 36. */
  size?: number;
  /**
   * Show the dark-navy rounded-rect background.
   * Set false when the logo sits on an already-dark surface (e.g. sidebar).
   */
  showBg?: boolean;
  /**
   * Inverted colour scheme — dark marks on a light background.
   * Use when showBg=false and the surface is light.
   */
  inverted?: boolean;
  className?: string;
}

export function QuroLogo({
  size = 36,
  showBg = true,
  inverted = false,
  className = "",
}: QuroLogoProps) {
  const raw = useId();
  const id = raw.replace(/:/g, "");

  // Adaptive colours
  const arcStroke    = inverted ? "#0a0f1e" : "white";
  const arcOpacity   = inverted ? 0.88      : 0.92;
  const ghostOpacity = inverted ? 0.06      : 0.06;
  const dotFill      = inverted ? "#6366f1" : "white";
  const dotOpacity   = inverted ? 1         : 0.72;
  const tailA        = inverted ? "#6366f1" : "#818cf8";
  const tailB        = inverted ? "#8b5cf6" : "#c084fc";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Quro logo mark"
    >
      <defs>
        {showBg && (
          <linearGradient
            id={`${id}bg`}
            x1="0" y1="0" x2="64" y2="64"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%"   stopColor="#0d1627" />
            <stop offset="100%" stopColor="#1b2550" />
          </linearGradient>
        )}

        {/* Tail gradient — runs from arc-end up to the bezier tip */}
        <linearGradient
          id={`${id}tail`}
          x1="49.32" y1="42" x2="57" y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0%"   stopColor={tailA} />
          <stop offset="100%" stopColor={tailB} />
        </linearGradient>
      </defs>

      {/* ── Background ─────────────────────────────────────────────────────── */}
      {showBg && (
        <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />
      )}

      {/* ── Ghost ring (depth layer) ────────────────────────────────────────── */}
      <circle
        cx="32" cy="32" r="20"
        fill="none"
        stroke={arcStroke}
        strokeWidth="4.8"
        strokeOpacity={ghostOpacity}
      />

      {/* ── Main Q arc — 315° clockwise, gap at lower-right (30°–75°) ────────
           Start: angle 75° → (37.18, 51.32)
           End  : angle 30° → (49.32, 42.00)
           Clockwise from 75°→30° = 360°−45° = 315°
           SVG: sweep-flag=1, large-arc-flag=1                              */}
      <path
        d="M 37.18 51.32 A 20 20 0 1 1 49.32 42"
        fill="none"
        stroke={arcStroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeOpacity={arcOpacity}
      />

      {/* ── Tail — quadratic bezier from arc end, sweeping UP-RIGHT ──────────
           Start : (49.32, 42)   — arc end at 30°
           Ctrl  : (54.32, 33.34) — arc tangent at 30° × 10 units
                   tangent = (sin30°, −cos30°)=(0.5,−0.866)×10 ≈ (+5, −8.66)
           End   : (57, 24)      — tip of the tail                         */}
      <path
        d="M 49.32 42 Q 54.32 33.34 57 24"
        fill="none"
        stroke={`url(#${id}tail)`}
        strokeWidth="5"
        strokeLinecap="round"
      />

      {/* ── Centre dot ─────────────────────────────────────────────────────── */}
      <circle cx="32" cy="32" r="2.8" fill={dotFill} fillOpacity={dotOpacity} />
    </svg>
  );
}
