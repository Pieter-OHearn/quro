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

type LogoColors = {
  arcStroke: string;
  arcOpacity: number;
  ghostOpacity: number;
  dotFill: string;
  dotOpacity: number;
  tailA: string;
  tailB: string;
};

function getLogoColors(inverted: boolean): LogoColors {
  return {
    arcStroke:    inverted ? "#0a0f1e" : "white",
    arcOpacity:   inverted ? 0.88      : 0.92,
    ghostOpacity: 0.06,
    dotFill:      inverted ? "#6366f1" : "white",
    dotOpacity:   inverted ? 1         : 0.72,
    tailA:        inverted ? "#6366f1" : "#818cf8",
    tailB:        inverted ? "#8b5cf6" : "#c084fc",
  };
}

type LogoDefsProps = { id: string; showBg: boolean; tailA: string; tailB: string };

function LogoDefs({ id, showBg, tailA, tailB }: LogoDefsProps) {
  return (
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
      <linearGradient
        id={`${id}tail`}
        x1="49.32" y1="42" x2="57" y2="24"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0%"   stopColor={tailA} />
        <stop offset="100%" stopColor={tailB} />
      </linearGradient>
    </defs>
  );
}

type LogoBodyProps = { id: string; showBg: boolean; colors: LogoColors };

function LogoBody({ id, showBg, colors }: LogoBodyProps) {
  const { arcStroke, arcOpacity, ghostOpacity, dotFill, dotOpacity } = colors;
  return (
    <>
      {showBg && <rect width="64" height="64" rx="15" fill={`url(#${id}bg)`} />}
      <circle cx="32" cy="32" r="20" fill="none" stroke={arcStroke} strokeWidth="4.8" strokeOpacity={ghostOpacity} />
      <path
        d="M 37.18 51.32 A 20 20 0 1 1 49.32 42"
        fill="none"
        stroke={arcStroke}
        strokeWidth="5"
        strokeLinecap="round"
        strokeOpacity={arcOpacity}
      />
      <path
        d="M 49.32 42 Q 54.32 33.34 57 24"
        fill="none"
        stroke={`url(#${id}tail)`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="32" cy="32" r="2.8" fill={dotFill} fillOpacity={dotOpacity} />
    </>
  );
}

export function QuroLogo({
  size = 36,
  showBg = true,
  inverted = false,
  className = "",
}: QuroLogoProps) {
  const raw = useId();
  const id = raw.replace(/:/g, "");

  const colors = getLogoColors(inverted);
  const { tailA, tailB } = colors;

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
      <LogoDefs id={id} showBg={showBg} tailA={tailA} tailB={tailB} />
      <LogoBody id={id} showBg={showBg} colors={colors} />
    </svg>
  );
}
