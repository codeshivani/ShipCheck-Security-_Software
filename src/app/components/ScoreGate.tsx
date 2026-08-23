"use client";

import { Grade } from "@/types/reports";

const GRADE_COLOR: Record<Grade, string> = {
  A: "var(--sc-pass)",
  B: "var(--sc-pass)",
  C: "var(--sc-medium)",
  D: "var(--sc-high)",
  F: "var(--sc-critical)",
};

interface ScoreGateProps {
  score: number;
  grade: Grade;
  size?: "lg" | "md";
}

/**
 * The signature element: a security gate — two pillars the score "passes
 * through," echoing the product's positioning as the checkpoint between
 * AI-generated code and production. The glow color tracks the grade.
 */
export function ScoreGate({ score, grade, size = "lg" }: ScoreGateProps) {
  const color = GRADE_COLOR[grade];
  const dims = size === "lg" ? { w: 280, h: 220 } : { w: 180, h: 150 };

  return (
    <div className="flex flex-col items-center gap-4">
      <svg
        width={dims.w}
        height={dims.h}
        viewBox="0 0 280 220"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label={`ShipCheck Risk Score ${score} out of 100, grade ${grade}`}
      >
        {/* left pillar */}
        <rect x="18" y="20" width="16" height="180" rx="3" fill="var(--sc-surface-2)" stroke="var(--sc-border)" />
        {/* right pillar */}
        <rect x="246" y="20" width="16" height="180" rx="3" fill="var(--sc-surface-2)" stroke="var(--sc-border)" />
        {/* top beam */}
        <rect x="18" y="14" width="244" height="10" rx="3" fill="var(--sc-surface-2)" stroke="var(--sc-border)" />
        {/* glow arch reflecting grade */}
        <path
          d="M 34 200 L 34 60 Q 34 24 70 24 L 210 24 Q 246 24 246 60 L 246 200"
          stroke={color}
          strokeWidth="2"
          fill="none"
          opacity="0.55"
        />
        {/* gate floor tick marks */}
        {Array.from({ length: 9 }).map((_, i) => (
          <line
            key={i}
            x1={40 + i * 25}
            y1="204"
            x2={40 + i * 25}
            y2="210"
            stroke="var(--sc-border)"
            strokeWidth="2"
          />
        ))}
      </svg>

      <div className="flex flex-col items-center -mt-28 sc-fade-up">
        <span
          className="font-display font-bold tabular-nums leading-none"
          style={{ fontSize: size === "lg" ? "56px" : "38px", color }}
        >
          {score}
        </span>
        <span className="text-sc-muted text-xs font-display tracking-wider mt-1">/ 100</span>
        <span
          className="font-display font-bold mt-2 px-3 py-0.5 rounded border text-sm tracking-widest"
          style={{ color, borderColor: color, backgroundColor: `${color}14` }}
        >
          {grade}
        </span>
      </div>
    </div>
  );
}
