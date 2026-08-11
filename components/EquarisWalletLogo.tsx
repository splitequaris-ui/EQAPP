import React from "react";
import Svg, { Path, Circle, Rect, G } from "react-native-svg";

interface EquarisWalletLogoProps {
  size?: number;
}

export default function EquarisWalletLogo({ size = 36 }: EquarisWalletLogoProps) {
  const maroon = "#6b1a2a";
  const gold = "#b8943a";

  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      {/* ── BANKNOTE 1 (back, left) ─────────────────────────────── */}
      {/* Note body outline */}
      <Path
        d="M18 44 L50 12 L72 30 L40 62 Z"
        stroke={maroon}
        strokeWidth="4.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Solid filled dark tip at top of note 1 */}
      <Path
        d="M50 12 L40 22 C44 27 52 28 60 22 Z"
        fill={maroon}
      />

      {/* ── BANKNOTE 2 (front, right) ─────────────────────────── */}
      {/* Note body outline */}
      <Path
        d="M34 50 L66 16 L88 36 L56 68 Z"
        stroke={maroon}
        strokeWidth="4.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        fill="none"
      />
      {/* Solid filled dark tip at top of note 2 */}
      <Path
        d="M66 16 L56 26 C60 31 70 31 78 25 Z"
        fill={maroon}
      />

      {/* ── WALLET BODY ─────────────────────────────────────────── */}
      {/* Main rounded rectangle – BOTTOM LINE has a gap (L90 to L52) for the gold slash */}
      {/* Left + Top arc + Right + Bottom-right segment */}
      <Path
        d="M 90 110 H 22 C 14 110 8 104 8 96 V 46 C 8 38 14 32 22 32 H 90 C 98 32 104 38 104 46 V 96 C 104 104 98 110 90 110"
        stroke={maroon}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Inner top wallet opening edge */}
      <Path
        d="M 12 48 H 36"
        stroke={maroon}
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      {/* Small curved bump over the bills pocket */}
      <Path
        d="M 42 40 Q 56 34 70 40"
        stroke={maroon}
        strokeWidth="4.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* ── RIGHT SNAP CLASP ─────────────────────────────────────── */}
      <Path
        d="M 96 62 H 108 C 116 62 116 76 108 76 H 96"
        stroke={maroon}
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Clasp center dot */}
      <Circle cx="100" cy="69" r="4" fill={maroon} />

      {/* ── DIAGONAL GOLD SLASH ────────────────────────────────── */}
      {/* Passes through the wallet body and through the gap in the bottom border */}
      <Path
        d="M 38 114 L 82 26"
        stroke={gold}
        strokeWidth="6"
        strokeLinecap="round"
      />
    </Svg>
  );
}
